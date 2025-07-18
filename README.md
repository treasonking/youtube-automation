# YouTube 게시물 자동화 도구

YouTube 게시물을 자동으로 업로드하는 도구입니다.

## 🚀 설치 및 실행

### 1. 의존성 설치

```bash
# Node.js 의존성 설치
npm install

# Python 의존성 설치
pip install -r requirements.txt
```

### 2. 환경변수 설정

1. `env.example` 파일을 `.env`로 복사
2. `.env` 파일에서 YouTube API 키 설정

```bash
cp env.example .env
```

`.env` 파일 편집:
```
YOUTUBE_API_KEY=your_actual_youtube_api_key_here
```

### 3. YouTube API 키 발급

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. YouTube Data API v3 활성화
4. 사용자 인증 정보에서 API 키 생성
5. 생성된 키를 `.env` 파일에 입력

### 4. 서버 실행

```bash
npm start
```

브라우저에서 `http://localhost:3000` 접속

## 📁 프로젝트 구조

```
y_post-main/
├── server.js              # Node.js 서버
├── automation_fixed.py    # Python 자동화 스크립트
├── public/               # 웹 인터페이스
├── temp/                 # 임시 파일 (자동 생성)
├── logs/                 # 로그 파일 (자동 생성)
├── chromedriver/         # ChromeDriver (자동 생성)
└── python/              # Python 라이브러리
```

## ⚠️ 주의사항

- YouTube의 자동화 정책을 준수하세요
- 과도한 요청은 계정 제재의 원인이 될 수 있습니다
- API 키는 절대 공개하지 마세요

## 🔧 문제 해결

### ChromeDriver 오류
- Chrome 브라우저가 최신 버전인지 확인
- 스크립트가 자동으로 호환되는 ChromeDriver를 다운로드합니다

### API 키 오류
- `.env` 파일에 올바른 API 키가 설정되었는지 확인
- YouTube Data API v3가 활성화되었는지 확인

## �� 라이선스

MIT License