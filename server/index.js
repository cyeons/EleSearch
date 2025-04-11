// server/index.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const { OpenAI } = require('openai');
const { isReliableResult } = require('./utils/validate');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔗 question 라우터 연결
const questionRoute = require('./routes/question');
app.use('/question', questionRoute);

// 🔍 검색 API
app.post('/search', async (req, res) => {
  const { keyword } = req.body;
  console.log(`\n🔍 검색 시작: ${keyword}`);

  let success = false;
  let source = '';
  let originalText = '';
  let summary = '';
  let questions = [];

  // 1단계: 한국어 위키
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

  // 2단계: 영어 위키
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

  // 3단계: Serper 검색
  if (!success) {
    try {
      console.log('🌐 3단계: Serper 웹 검색 시도');
      const response = await axios.post(
        'https://google.serper.dev/search',
        { q: keyword },
        { headers: { 'X-API-KEY': process.env.SERPER_API_KEY } }
      );
      const first = response.data.organic?.[0]?.snippet;
      if (!first) throw new Error('검색 결과 없음');
      originalText = first;
      source = 'Serper 웹 검색';
      success = true;
    } catch (err) {
      console.error(`❌ Serper 검색 실패: (${keyword}) →`, err.message);
      return res.status(404).json({ message: '관련 정보를 찾지 못했습니다.' });
    }
  }

  // ✅ GPT 요약
  const prompt = `
아래 내용을 초등학생이 이해할 수 있게 바꿔줘.
어려운 단어에는 괄호로 설명을 붙여줘.
내용은 부드럽고 친절한 말투로 정리해줘: ${source}

원문:
${originalText.slice(0, 2000)}
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '너는 어린이에게 쉬운 설명을 잘하는 친절한 도우미야.' },
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

  // ✅ 질문 추천
  try {
    const questionGen = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '너는 어린이의 호기심을 도와주는 질문 선생님이야.' },
        { role: 'user', content: `
아래 내용을 바탕으로 초등학생이 궁금해할 만한 질문을 최대 3개 추천해줘.
- 본문에 있는 정보만 사용하고, 짧고 자연스럽게 써줘.

내용:
${originalText.slice(0, 2000)}
        ` }
      ]
    });

    questions = questionGen.choices[0].message.content
      .split('\n')
      .map(q => q.trim())
      .filter(Boolean);
  } catch (err) {
    console.warn('❗ 질문 추천 실패:', err.message);
  }

  // ✅ 정확성 검사
  const isSerper = source === 'Serper 웹 검색';
  const valid = isReliableResult(originalText, summary, keyword, isSerper);
  if (!valid) {
    console.log(`⚠️ 결과 부정확 (${isSerper ? 'Serper 조건 완화됨' : '기본 조건'}) → 실패 처리`);
    return res.status(404).json({ message: '관련된 정보를 찾지 못했습니다.' });
  }

  console.log(`🎉 검색 성공 → 출처: ${source}`);
  res.json({ summary, questions, source, originalText });
});

app.listen(port, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${port}`);
});
