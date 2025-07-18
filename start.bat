@echo off
echo ========================================
echo    YouTube 게시물 자동화 도구 시작
echo ========================================
echo.

echo [1/3] Node.js 의존성 설치 중...
call npm install
if %errorlevel% neq 0 (
    echo 오류: Node.js 의존성 설치 실패
    pause
    exit /b 1
)

echo.
echo [2/3] Python 의존성 설치 중...
call pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo 오류: Python 의존성 설치 실패
    pause
    exit /b 1
)

echo.
echo [3/3] 서버 시작 중...
echo.
echo 브라우저에서 http://localhost:3000 으로 접속하세요!
echo.
call npm start 