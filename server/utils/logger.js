const fs = require('fs');
const path = require('path');

// 📁 logs 폴더 설정
const logDir = path.join(__dirname, '../logs');

// 없으면 자동 생성
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// ✅ 한국 기준 시간 (YYYY-MM-DD HH:mm:ss)
function getKoreanTimestamp() {
  return new Date().toLocaleString('sv-SE', {
    timeZone: 'Asia/Seoul'
  }).replace('T', ' ');
}

// ✅ 오늘 날짜 (YYYY-MM-DD)
function getTodayDate() {
  return new Date().toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Seoul'
  });
}

// ✅ 14일 이상된 로그 제거
function cleanOldLogs() {
  const files = fs.readdirSync(logDir);
  const now = Date.now();
  const MAX_DAYS = 14;

  files.forEach(file => {
    const match = file.match(/\d{4}-\d{2}-\d{2}/);
    if (match) {
      const date = new Date(match[0]);
      const age = (now - date.getTime()) / (1000 * 60 * 60 * 24);
      if (age > MAX_DAYS) {
        fs.unlinkSync(path.join(logDir, file));
        console.log(`🧹 오래된 로그 삭제됨: ${file}`);
      }
    }
  });
}

// ✅ 검색 로그 기록
function logSearch(ip, keyword, userId) {
  // const timestamp = getKoreanTimestamp();
  // const filename = `search-${getTodayDate()}.log`;
  // const logLine = `[${timestamp}] 검색: ${keyword} | IP: ${ip} | UUID: ${userId}\n`;

  // fs.appendFileSync(path.join(logDir, filename), logLine, 'utf-8');
}

// ✅ 에러 로그 기록
function logError(message) {
  // const timestamp = getKoreanTimestamp();
  // const filename = `error-${getTodayDate()}.log`;
  // const logLine = `[${timestamp}] ❌ ERROR: ${message}\n`;

  // fs.appendFileSync(path.join(logDir, filename), logLine, 'utf-8');
}

cleanOldLogs(); // 🧹 서버 실행 시 오래된 로그 정리

module.exports = { logSearch, logError };
