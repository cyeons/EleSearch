const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// 🇰🇷 한국 시간 포맷 반환 함수
function getKoreanTimestamp() {
  const now = new Date();
  return now.toLocaleString('sv-SE', {
    timeZone: 'Asia/Seoul'
  }).replace('T', ' '); // ex: "2024-04-18 16:44:12"
}

// 검색 로그 기록
function logSearch(ip, keyword, userId) {
  const logLine = `[${getKoreanTimestamp()}] 검색: ${keyword} | IP: ${ip} | UUID: ${userId}\n`;
  fs.appendFileSync(path.join(logDir, 'search.log'), logLine, 'utf-8');
}

// 에러 로그 기록
function logError(message) {
  const logLine = `[${getKoreanTimestamp()}] ❌ ERROR: ${message}\n`;
  fs.appendFileSync(path.join(logDir, 'error.log'), logLine, 'utf-8');
}

module.exports = { logSearch, logError };
