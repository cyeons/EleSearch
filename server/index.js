// server/index.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const { OpenAI } = require('openai');
const { isReliableResult, isValidKeyword, containsBlockedWord } = require('./utils/validate');
const rateLimit = require('express-rate-limit');
const recentSearchCache = new Map(); // key: ip+keyword, value: timestamp
const { logSearch, logError } = require('./utils/logger');
const dailyRequestCount = new Map(); // key: userId, value: { count, lastDate }
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const app = express();
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1분
  max: 5,
  keyGenerator: (req) => {
    return req.headers['x-user-id'] || req.ip; // uuid 우선, 없으면 IP
  },
  message: { message: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' }
});


app.use(cors());
app.use(express.json());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


// 보호용 미들웨어
function checkAdminToken(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).send('🚫 접근이 제한되었습니다.');
  }
  next();
}

// 캐시 검사 함수
function isDuplicateSearch(ip, keyword) {
  const key = `${ip}_${keyword.trim().toLowerCase()}`;
  const now = Date.now();
  const previous = recentSearchCache.get(key);

  if (previous && now - previous < 60 * 1000) {
    return true; // 1분 이내에 중복 요청
  }

  recentSearchCache.set(key, now);
  return false;
}

// 일일 요청 제한 검사 함수 //
function isOverDailyLimit(userId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const record = dailyRequestCount.get(userId);

  if (!record || record.lastDate !== today) {
    dailyRequestCount.set(userId, { count: 1, lastDate: today });
    return false;
  }

  if (record.count >= 100) return true;

  record.count++;
  dailyRequestCount.set(userId, record);
  return false;
}
// 🔗 question 라우터
const questionRoute = require('./routes/question');
app.use('/question', questionRoute);

// 🔍 검색 API
app.post('/search', searchLimiter, async (req, res) => {
  const totalStart = Date.now();
  const timeMark = (label) => {
    const now = Date.now();
    const diff = now - totalStart;
    console.log(`⏱️ ${label}: +${diff}ms`);
  };

  const { keyword: userQuery } = req.body;
  const userId = req.headers['x-user-id'] || 'unknown';

  if (!userQuery?.trim()) {
    return res.status(400).json({ message: '검색어를 입력해주세요.' });
  }
  if (!isValidKeyword(userQuery)) {
    return res.status(400).json({ message: '검색어가 올바르지 않아요. 다시 입력해 주세요.' });
  }
  if (containsBlockedWord(userQuery)) {
    return res.status(403).json({ message: '이런 표현은 사용할 수 없어요. 다시 입력해주세요.' });
  }
  if (isOverDailyLimit(userId)) {
    return res.status(429).json({ message: '오늘은 더 이상 검색할 수 없어요. 내일 다시 시도해 주세요.' });
  }

  console.log(`\n🔍 검색 시작: ${userQuery}`);
  timeMark('요청 수신');

  let keyword = userQuery.trim();

  try {
    const extractPrompt = `다음 문장에서 핵심 키워드 하나만 뽑아줘. 문장: "${userQuery}"`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '너는 문장에서 핵심 키워드 하나만 뽑아주는 도우미야.' },
        { role: 'user', content: extractPrompt }
      ],
      temperature: 0.3
    });
    keyword = completion.choices[0].message.content.trim();
    console.log(`🔑 추출된 키워드: ${keyword}`);
  } catch (err) {
    console.warn('⚠️ 키워드 추출 실패. 원문 그대로 사용:', err.message);
  }

  timeMark('키워드 추출 완료');

  let success = false;
  let source = '';
  let originalText = '';
  let summary = '';
  let questions = [];

  try {
    console.log('🌐 1단계: 한국어 위키 검색 시도');
    const response = await axios.get(
      `https://ko.wikipedia.org/wiki/${encodeURIComponent(keyword)}`,
      { timeout: 5000 }
    );
    const $ = cheerio.load(response.data);
    const content = $('#mw-content-text .mw-parser-output p').text().trim();
    if (!content || content.length < 50) {
      throw new Error('본문 없음 또는 너무 짧음');
    }
    originalText = content;
    source = '한국어 위키피디아';
    success = true;
  } catch (err) {
    console.warn('⚠️ 한국어 위키 검색 실패:', err.response?.status || '응답 없음', err.message);
  }

  if (!success) {
    try {
      console.log('🌐 2단계: 영어 위키 검색 시도');
      const response = await axios.get(
        `https://en.wikipedia.org/wiki/${encodeURIComponent(keyword)}`,
        { timeout: 5000 }
      );
      const $ = cheerio.load(response.data);
      const content = $('#mw-content-text .mw-parser-output p').text().trim();
      if (!content || content.length < 50) {
        throw new Error('본문 없음 또는 너무 짧음');
      }
      originalText = content;
      source = '영어 위키피디아';
      success = true;
    } catch (err) {
      console.warn('⚠️ 영어 위키 검색 실패:', err.response?.status || '응답 없음', err.message);
    }
  }

  if (!success) {
    try {
      console.log('🌐 3단계: Serper 웹 검색 시도');
      const response = await axios.post(
        'https://google.serper.dev/search',
        { q: userQuery },
        {
          headers: { 'X-API-KEY': process.env.SERPER_API_KEY },
          timeout: 7000
        }
      );
      const first = response.data.organic?.[0]?.snippet;
      if (!first) throw new Error('검색 결과 없음');
      originalText = first;
      source = 'Serper 웹 검색';
      success = true;
    } catch (err) {
      console.error(`❌ Serper 검색 실패: (${userQuery}) →`, err.message);
      logError(`Serper 검색 실패: (${userQuery}) → ${err.message}`);
      return res.status(404).json({ message: '관련 정보를 찾지 못했습니다.' });
    }
  }

  timeMark(`데이터 수집 완료 (${source})`);

  const userIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  if (isDuplicateSearch(userIp, keyword)) {
    return res.status(429).json({ message: '같은 내용을 너무 자주 검색하고 있어요. 잠시 후 다시 시도해주세요.' });
  }
  logSearch(userIp, userQuery, userId);

  const prompt = `
"${userQuery}"라는 주제를 초등학생이 이해할 수 있게 설명해줘.
어려운 단어는 괄호로 간단히 설명해주고, 친절한 말투로 정리해줘.
참고 내용: ${source}

내용:
${originalText.slice(0, 2000)}
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '너는 초등학생에게 친절하게 설명하는 도우미야.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6,
    });

    summary = completion.choices[0].message.content.trim();
  } catch (err) {
    const status = err.response?.status;
    logError(`GPT 요약 실패: ${err.message}`);
    if (status === 429) {
      return res.status(429).json({ message: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' });
    }
    return res.status(500).json({ message: '요약 실패', error: err.message });
  }

  timeMark('GPT 요약 완료');

  try {
    const questionGen = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: '너는 초등학생의 호기심을 도와주는 질문 선생님이야...',
        },
        {
          role: 'user',
          content: `
아래 내용을 읽은 초등학생이 더 궁금해할 만한 질문을 최대 3개 추천해줘.
- 너무 일반적이거나 범위가 넓은 질문은 피하고,
- 내용을 더 깊이 이해할 수 있게 돕는 질문을 해줘.
- 질문은 간결하고 쉬운 말로 작성해줘.

내용:
${summary}
          `.trim(),
        }
      ],
      temperature: 0.6
    });

    questions = questionGen.choices[0].message.content
      .split('\n')
      .map(q => q.trim().replace(/^\d+\.\s*/, ''))
      .filter(Boolean);
  } catch (err) {
    console.warn('❗ 질문 추천 실패:', err.message);
    logError(`질문 추천 실패: ${err.message}`);
  }

  timeMark('질문 추천 완료');

  const isSerper = source === 'Serper 웹 검색';
  const valid = isReliableResult(originalText, summary, userQuery, isSerper);
  if (!valid) {
    console.log(`⚠️ 결과 부정확 → 실패 처리`);
    return res.status(404).json({ message: '관련된 정보를 찾지 못했습니다.' });
  }

  const totalDuration = Date.now() - totalStart;
  console.log(`🎉 검색 성공 → 총 소요 시간: ${totalDuration}ms`);

  res.json({ summary, questions, source, originalText });
}); // ✅ ← app.post('/search') 닫기용 괄호

// ✅ 아래는 서버 실행과 로그 API

if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`✅ 서버 실행 중: http://localhost:${port}`);
  });
}

module.exports = app;

app.get('/admin/logs/:date', checkAdminToken, (req, res) => {
  const date = req.params.date; // 예: 2024-04-18
  const logPath = path.join(__dirname, 'logs', `search-${date}.log`);

  if (!fs.existsSync(logPath)) {
    return res.status(404).send('📭 해당 날짜의 검색 로그가 없습니다.');
  }

  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
  const lastLines = lines.slice(-100).join('\n');

  res.set('Content-Type', 'text/plain');
  res.send(lastLines);
});

app.get('/admin/errors/:date', checkAdminToken, (req, res) => {
  const date = req.params.date; // 예: 2024-04-18
  const logPath = path.join(__dirname, 'logs', `error-${date}.log`);

  if (!fs.existsSync(logPath)) {
    return res.status(404).send('📭 해당 날짜의 에러 로그가 없습니다.');
  }

  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
  const lastLines = lines.slice(-100).join('\n');

  res.set('Content-Type', 'text/plain');
  res.send(lastLines);
});


