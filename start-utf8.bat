@echo off
chcp 65001 >nul
title YouTube 게시물 자동화 - UTF8 지원

echo ========================================
echo    YouTube 게시물 자동화 도구 시작
echo ========================================
echo.

REM UTF-8 환경 변수 설정
set PYTHONIOENCODING=utf-8
set PYTHONLEGACYWINDOWSSTDIO=utf-8

REM Node.js 서버 시작
echo [1/2] 서버 시작 중...
start /min "YouTube Automation Server" cmd /c "node src/server/main.js"

REM 잠시 대기
timeout /t 3 /nobreak >nul

REM 브라우저 열기
echo [2/2] 브라우저 열기...
start "" "http://localhost:3000"

echo.
echo ✅ 실행 완료!
echo 📱 브라우저에서 http://localhost:3000 접속
echo 🔧 인코딩 문제 해결됨
echo.
echo 종료하려면 아무 키나 누르세요...
pause >nul 