$msg = Read-Host "💬 커밋 메시지를 입력하세요"

if (-not $msg) {
  Write-Host "⛔ 커밋 메시지를 입력하지 않아 배포를 종료합니다."
  exit
}

git add .

# ✅ 메시지를 안전하게 나눠서 전달
git commit -m $msg

git push origin main
git subtree push --prefix server heroku main
