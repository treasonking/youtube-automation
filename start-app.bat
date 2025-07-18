@echo off
echo 🎬 YouTube 자동화 Pro 앱 시작 중...
echo.

:: Node.js 설치 확인
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js가 설치되지 않았습니다.
    echo 📥 https://nodejs.org 에서 Node.js를 다운로드하여 설치해주세요.
    pause
    exit /b 1
)

:: Python 설치 확인
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python이 설치되지 않았습니다.
    echo 📥 https://python.org 에서 Python을 다운로드하여 설치해주세요.
    pause
    exit /b 1
)

:: npm 패키지 설치 확인
if not exist "node_modules" (
    echo 📦 npm 패키지 설치 중...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ npm 패키지 설치 실패
        pause
        exit /b 1
    )
)

:: Python 패키지 설치 확인
if exist "requirements.txt" (
    echo 🐍 Python 패키지 확인 중...
    pip install -r requirements.txt >nul 2>&1
)

echo ✅ 모든 의존성 확인 완료
echo.
echo 🚀 YouTube 자동화 Pro 앱 실행 중...
echo 📱 잠시 후 앱 창이 열립니다.
echo.
echo 💡 사용법:
echo   1. 로그인 탭에서 YouTube 계정 정보 입력
echo   2. 게시물 탭에서 텍스트 + 이미지 + 동영상 추가
echo   3. 설정 탭에서 자동화 옵션 조정
echo   4. 실행 탭에서 자동화 시작
echo.
echo 📸 이미지 업로드: 파일 선택으로 여러 이미지 추가
echo 🎬 동영상 추가: 검색으로 YouTube 동영상 선택
echo 💾 자동 저장: 모든 게시물과 미디어 자동 저장
echo.

:: Electron 앱 실행
npm run electron

if %errorlevel% neq 0 (
    echo.
    echo ❌ 앱 실행 실패
    echo 🔧 문제 해결:
    echo   1. Node.js와 Python이 올바르게 설치되었는지 확인
    echo   2. npm install 명령어로 패키지 재설치
    echo   3. 관리자 권한으로 실행
    echo.
    pause
    exit /b 1
)

echo.
echo 👋 앱이 종료되었습니다.
pause 