// services/wikipedia-en.js
const axios = require('axios');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * GPT를 이용해 한글 키워드를 영어 위키피디아 검색어로 번역합니다.
 */
async function translateToEnglishTitle(koreanKeyword) {
  const prompt = `"${koreanKeyword}"를 영어 위키피디아에서 검색 가능한 영어 제목으로 번역해줘. 대답은 영어 제목 하나만 해줘.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '너는 위키피디아 검색어를 잘 아는 번역 도우미야.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error('❌ GPT 번역 실패:', err.message);
    return null;
  }
}

/**
 * 영어 위키피디아에서 주제 내용을 가져옵니다.
 */
async function getEnglishWikipediaContent(koreanKeyword) {
  const englishTitle = await translateToEnglishTitle(koreanKeyword);
  if (!englishTitle) return null;

  const endpoint = 'https://en.wikipedia.org/w/api.php';
  const params = {
    action: 'query',
    format: 'json',
    prop: 'extracts',
    exintro: true,
    explaintext: true,
    redirects: 1,
    titles: englishTitle
  };

  try {
    const response = await axios.get(endpoint, { params });
    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];
    const extract = pages[pageId].extract;

    if (pages[pageId].missing || !extract || extract.trim().length < 50) {
      return null;
    }

    return extract.trim();
  } catch (err) {
    console.error('❌ 영어 위키 요청 실패:', err.message);
    return null;
  }
}

module.exports = { getEnglishWikipediaContent };
