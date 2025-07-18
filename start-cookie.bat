@echo off
chcp 65001 > nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

echo ================================================
echo    YouTube 게시물 자동화 - 쿠키 기반 (확실함)
echo ================================================
echo.
echo 🚀 Google 로그인 완전 우회 방식
echo 📝 한 번 로그인하면 쿠키로 자동 로그인
echo 💯 비밀번호 입력 문제 완전 해결
echo.

cd /d "%~dp0"

echo 게시물 내용을 입력하세요:
set /p content="내용: "
echo.

echo 🍪 쿠키 기반 자동화 실행 중...
echo ⚠️  처음 실행시 브라우저에서 직접 로그인해주세요
echo ✅ 다음부터는 자동으로 로그인됩니다
echo.

python automation_cookie.py "%content%"

echo.
echo 작업 완료. 아무 키나 누르면 종료됩니다.
pause > nul 