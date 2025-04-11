// server/index.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const { OpenAI } = require('openai');
const { isReliableResult } = require('./utils/validate');
const rateLimit = require('express-rate-limit');
const recentSearchCache = new Map(); // key: ip+keyword, value: timestamp
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 5,
  message: { message: '⏱ 요청이 너무 많아요. 잠시 후 다시 시도해주세요.' }
});


app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 캐시 검사 함수수
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


// 🔗 question 라우터
const questionRoute = require('./routes/question');
app.use('/question', questionRoute);

// 🔍 검색 API
app.post('/search', searchLimiter, async (req, res) => {
  const { keyword: userQuery } = req.body;
  if (!userQuery?.trim()) {
    return res.status(400).json({ message: '검색어를 입력해주세요.' });
  }

  console.log(`\n🔍 검색 시작: ${userQuery}`);
  let keyword = userQuery.trim();

  // 1단계: GPT로 핵심 키워드 추출
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

  let success = false;
  let source = '';
  let originalText = '';
  let summary = '';
  let questions = [];

  // 2단계: 한국어 위키
  try {
    console.log('🌐 1단계: 한국어 위키 검색 시도');
    const response = await axios.get(`https://ko.wikipedia.org/wiki/${encodeURIComponent(keyword)}`);
    const $ = cheerio.load(response.data);
    const content = $('#mw-content-text .mw-parser-output p').text().trim();
    originalText = content;
    source = '한국어 위키피디아';
    success = true;
  } catch (err) {
    console.warn('⚠️ 한국어 위키 검색 실패:', err.message);
  }

  // 3단계: 영어 위키
  if (!success) {
    try {
      console.log('🌐 2단계: 영어 위키 검색 시도');
      const response = await axios.get(`https://en.wikipedia.org/wiki/${encodeURIComponent(keyword)}`);
      const $ = cheerio.load(response.data);
      const content = $('#mw-content-text .mw-parser-output p').text().trim();
      originalText = content;
      source = '영어 위키피디아';
      success = true;
    } catch (err) {
      console.warn('⚠️ 영어 위키 검색 실패:', err.message);
    }
  }

  // 4단계: Serper 검색 (자연어 그대로 사용)
  if (!success) {
    try {
      console.log('🌐 3단계: Serper 웹 검색 시도');
      const response = await axios.post(
        'https://google.serper.dev/search',
        { q: userQuery },
        { headers: { 'X-API-KEY': process.env.SERPER_API_KEY } }
      );
      const first = response.data.organic?.[0]?.snippet;
      if (!first) throw new Error('검색 결과 없음');
      originalText = first;
      source = 'Serper 웹 검색';
      success = true;
    } catch (err) {
      console.error(`❌ Serper 검색 실패: (${userQuery}) →`, err.message);
      return res.status(404).json({ message: '관련 정보를 찾지 못했습니다.' });
    }
  }

  // 중복 요청 방지 검사
const userIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

if (isDuplicateSearch(userIp, keyword)) {
  return res.status(429).json({ message: '같은 내용을 너무 자주 검색하고 있어요. 잠시 후 다시 시도해주세요.' });
}

  // 5단계: GPT 요약
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
    if (status === 429) {
      return res.status(429).json({ message: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' });
    }
    return res.status(500).json({ message: '요약 실패', error: err.message });
  }

// ✅ 질문 추천 (요약 결과 기반)
try {
  const questionGen = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: '너는 초등학생의 호기심을 도와주는 질문 선생님이야. 요약 내용을 읽고, 그 내용을 바탕으로 아이들이 궁금해할 만한 짧고 쉬운 질문을 만들어줘.',
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
    .map(q => q.trim().replace(/^\d+\.\s*/, '')) // 번호 제거
    .filter(Boolean);
} catch (err) {
  console.warn('❗ 질문 추천 실패:', err.message);
}

  // 7단계: 정확성 검사
  const isSerper = source === 'Serper 웹 검색';
  const valid = isReliableResult(originalText, summary, userQuery, isSerper);
  if (!valid) {
    console.log(`⚠️ 결과 부정확 → 실패 처리`);
    return res.status(404).json({ message: '관련된 정보를 찾지 못했습니다.' });
  }

  console.log(`🎉 검색 성공 → 출처: ${source}`);
  res.json({ summary, questions, source, originalText });
});

app.listen(port, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${port}`);
});
