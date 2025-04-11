// utils/validate.js

/**
 * 검색 결과가 신뢰할 수 있는지 확인하는 평가 함수 (완화된 기준 + 디버깅 로그 포함)
 * 기준: 길이, 키워드 포함 여부, 요약 길이 등
 * @returns {boolean} - true면 신뢰 가능, false면 안내 메시지 출력
 */

function isReliableResult(originalText, summary, keyword, isSerper = false) {
  const tooShort = originalText.length < 200;
  const summaryTooShort = summary.length < 80;
  const containsWarning = summary.includes('정보가 부족합니다') || summary.includes('찾지 못했어요');

  const keywordLower = keyword.toLowerCase();
  const textLower = originalText.toLowerCase();
  const summaryLower = summary.toLowerCase();
  const keywordFirstWord = keywordLower.split(' ')[0];

  const keywordIncluded =
    textLower.includes(keywordLower) ||
    summaryLower.includes(keywordLower) ||
    textLower.includes(keywordFirstWord) ||
    summaryLower.includes(keywordFirstWord);

  console.log('🧪 정확성 검사 로그 --------------------------');
  console.log('📏 본문 길이:', originalText.length);
  console.log('📏 요약 길이:', summary.length);
  console.log('🔍 본문에 키워드 포함?:', textLower.includes(keywordLower));
  console.log('🔍 요약에 키워드 포함?:', summaryLower.includes(keywordLower));
  console.log('🔎 키워드 일부 포함 여부:', keywordFirstWord, '→', keywordIncluded);
  console.log('⚠️ 경고 문구 포함?:', containsWarning);

  // ✅ Serper는 길이 제한과 키워드 포함 조건 완화
  if (isSerper) {
    return keywordIncluded && !containsWarning;
  }

  // 기본 조건
  return !(tooShort || !keywordIncluded || summaryTooShort || containsWarning);
}

  
  module.exports = { isReliableResult };
  