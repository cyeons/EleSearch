const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, '../logs/search.log');

function logSearch(ip, keyword, userId) {
    const timestamp = new Date().toISOString();
    const logLine = `${timestamp} | IP: ${ip} | UUID: ${userId} | "${keyword}"\n`;
  
    fs.appendFile(logPath, logLine, (err) => {
      if (err) {
        console.error('❗ 검색 로그 기록 실패:', err.message);
      }
    });
  }
  

module.exports = { logSearch };
