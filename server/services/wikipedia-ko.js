// services/wikipedia-ko.js
const axios = require('axios');

/**
 * 한국어 위키피디아에서 주제에 맞는 요약문을 가져옵니다.
 * @param {string} keyword - 검색할 주제어
 * @returns {Promise<string|null>} - 요약 텍스트 또는 null
 */
async function getKoreanWikipediaSummary(keyword) {
  const endpoint = 'https://ko.wikipedia.org/w/api.php';
  const params = {
    action: 'query',
    format: 'json',
    prop: 'extracts',
    exintro: true,
    explaintext: true,
    redirects: 1,
    titles: keyword
  };

  try {
    const response = await axios.get(endpoint, { params });
    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];
    const extract = pages[pageId].extract;

    // 문서가 존재하지 않는 경우 (missing 속성 확인)
    if (pages[pageId].missing || !extract || extract.trim().length < 50) {
      return null;
    }

    return extract.trim();
  } catch (error) {
    console.error('❌ 한국어 위키 요약 실패:', error.message);
    return null;
  }
}

module.exports = { getKoreanWikipediaSummary };
