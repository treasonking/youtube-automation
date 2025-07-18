@echo off
echo.
echo ========================================
echo    🚀 YouTube 자동화 Pro 시작
echo ========================================
echo.
echo 📋 기능:
echo  ✅ 여러 게시물 순차 자동화
echo  ✅ 브라우저 표시/숨김 설정
echo  ✅ 속도 조절 (빠름/보통/느림)
echo  ✅ 게시물 간 대기 시간 설정
echo  ✅ 2차 인증 자동 처리
echo  ✅ 실시간 진행률 표시
echo.
echo 🌐 서버 시작 중...
echo.

REM Node.js 설치 확인
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js가 설치되지 않았습니다.
    echo 📥 https://nodejs.org 에서 Node.js를 설치해주세요.
    pause
    exit /b 1
)

REM Python 설치 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python이 설치되지 않았습니다.
    echo 📥 https://python.org 에서 Python을 설치해주세요.
    pause
    exit /b 1
)

REM 의존성 설치 확인
if not exist node_modules (
    echo 📦 Node.js 패키지 설치 중...
    npm install
)

REM Python 패키지 설치 확인
pip show selenium >nul 2>&1
if errorlevel 1 (
    echo 📦 Python 패키지 설치 중...
    pip install selenium undetected-chromedriver
)

echo ✅ 준비 완료!
echo.
echo 🌐 브라우저에서 다음 주소로 접속하세요:
echo    http://localhost:3000
echo.
echo 💡 팁:
echo  • 여러 게시물을 미리 등록하세요
echo  • 설정에서 브라우저 표시/숨김을 선택하세요
echo  • 속도를 조절하여 안정성을 높이세요
echo.
echo 🛑 종료하려면 Ctrl+C를 누르세요
echo.

REM 서버 시작
node server.js

pause 