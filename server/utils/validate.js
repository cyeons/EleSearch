// utils/validate.js

/**
 * 검색 결과가 신뢰할 수 있는지 확인하는 평가 함수 (완화된 기준 + 디버깅 로그 포함)
 * 기준: 길이, 키워드 포함 여부, 요약 길이 등
 * @returns {boolean} - true면 신뢰 가능, false면 안내 메시지 출력
 */
const fs = require('fs');
const path = require('path');
const BadWordsFilter = require('badwords-ko');   // 클래스 import
const filter = new BadWordsFilter();             // 인스턴스 생성

// 🔥 커스텀 금지어 로딩
try {
  const filePath = path.join(__dirname, '../data/custom-banned.txt');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const customWords = raw
    .split('\n')
    .map(word => word.trim())
    .filter(Boolean);
  filter.addWords(...customWords);
  console.log(`🧩 커스텀 금지어 ${customWords.length}개 추가됨`);
} catch (err) {
  console.warn('⚠️ custom-banned.txt 불러오기 실패:', err.message);
}

// 함수 시작 

console.log('🧪 badwords 내용:', BadWordsFilter);
console.log('🧪 메서드 목록:', Object.getOwnPropertyNames(Object.getPrototypeOf(filter)));


// 유효성 검사 
function isReliableResult(originalText, summary, keyword, isSerper = false) {
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
  console.log('🔍 본문에 키워드 포함?:', textLower.includes(keywordLower));
  console.log('🔍 요약에 키워드 포함?:', summaryLower.includes(keywordLower));
  console.log('🔎 키워드 일부 포함 여부:', keywordFirstWord, '→', keywordIncluded);
  console.log('⚠️ 경고 문구 포함?:', containsWarning);

  // ✅ Serper는 길이 제한과 키워드 포함 조건 완화
  if (isSerper) {
    return keywordIncluded && !containsWarning;
  }

  // 기본 조건
  return !(!keywordIncluded || containsWarning);
}

/// 악의적 패턴 차단 ///
function isValidKeyword(keyword) {
  const trimmed = keyword.trim().toLowerCase();

  // 거부할 패턴 목록
  const disallowedPatterns = [
    /<script>/i,                 // 스크립트 삽입
    /select\s+.*from/i,          // SQL 주입
    /union\s+select/i,
    /['";]/,                     // 따옴표/세미콜론 → SQL 구문
    /(https?|ftp):\/\//i,        // URL 입력
    /\s{3,}/,                    // 공백 3칸 이상 (무의미 스팸)
    /^[^가-힣a-zA-Z0-9]{3,}$/    // 특수문자만 반복
  ];

  return !disallowedPatterns.some(pattern => pattern.test(trimmed));
}

/// 욕설 및 비속어 차단 ///
function containsBlockedWord(text) {
  return filter.isProfane(text); 
}


  
  module.exports = { isReliableResult, isValidKeyword, containsBlockedWord };
  

