// services/serper.js
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Serper.dev를 통해 웹 검색 후, 상위 결과들의 본문 내용을 추출합니다.
 * @param {string} keyword - 검색할 주제어
 * @returns {Promise<Array<{ url: string, content: string }>>}
 */
async function getSerperWebResults(keyword) {
  const endpoint = 'https://google.serper.dev/search';

  try {
    const response = await axios.post(endpoint, {
      q: keyword
    }, {
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const webResults = response.data.web || [];
    const topResults = webResults.slice(0, 3);

    const extracted = await Promise.all(
      topResults.map(async (result) => {
        try {
          const page = await axios.get(result.link);
          const $ = cheerio.load(page.data);
          const text = $('body').text().replace(/\s+/g, ' ').slice(0, 1000);
          return { url: result.link, content: text };
        } catch (err) {
          return { url: result.link, content: '본문을 가져올 수 없습니다.' };
        }
      })
    );

    return extracted;
  } catch (err) {
    console.error('❌ Serper 검색 실패:', err.message);
    return [];
  }
}

module.exports = { getSerperWebResults };
