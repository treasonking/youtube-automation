@echo off
chcp 65001 > nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

echo ================================================
echo    YouTube 로그인 디버그 모드 (기존 파일 수정됨)
echo ================================================
echo.
echo 🔍 automation_fixed.py에 디버그 기능 추가됨
echo 📊 상세한 로그로 정확한 원인 파악
echo 🐛 비밀번호 입력 실패 원인 분석
echo.

cd /d "%~dp0"

echo 디버그용 계정 정보를 입력하세요:
set /p email="이메일: "
set /p password="비밀번호: "
echo.

echo 게시물 내용을 입력하세요:
set /p content="내용: "
echo.

echo 🔍 디버그 모드로 실행 중...
echo 📝 모든 로그를 자세히 확인하세요
echo.

python automation_fixed.py "%email%" "%password%" "%content%" --debug

echo.
echo 디버그 완료. 로그를 확인하세요.
pause > nul 