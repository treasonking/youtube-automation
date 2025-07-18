console.log('=== [SERVER STARTED] ===');

// 환경변수 로드
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const multer = require('multer');
const upload = multer({ dest: path.join(__dirname, 'temp') });
const fetch = require('node-fetch'); // YouTube API 연동용

const app = express();
const PORT = 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/temp', express.static(path.join(__dirname, 'temp'))); // 업로드 이미지 static 서빙

// 로그 디렉토리 생성
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// 로그 함수
function writeLog(level, message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    console.log(`[${level}] ${message}`);
    
    const logFile = path.join(logDir, `automation_${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logEntry, 'utf8');
}

// 메인 페이지
app.get('/', (req, res) => {
    const realPath = path.join(__dirname, 'public', 'index.html');
    console.log('Serving:', realPath);
    res.sendFile(realPath);
});

// 🆕 다중 게시물 자동화 API (📸🎬 미디어 지원)
app.post('/api/automate-batch', (req, res) => {
    console.log('=== [API /api/automate-batch called] ===');
    const { username, password, postContent, images = [], videos = [], settings, postIndex } = req.body;
    
    console.log(`🚀 게시물 ${postIndex + 1} 자동화 시작`);
    console.log(`📸 이미지: ${images.length}개, 🎬 동영상: ${videos.length}개`);
    console.log(`설정:`, settings);
    
    // Python 스크립트 실행 옵션 설정 (🚀 TURBO 지원)
    let scriptName = 'automation_fixed.py';
    
    // 🚀 속도 설정에 따라 스크립트 선택
    if (settings && settings.speed === 'fast') {
        scriptName = 'automation_turbo.py';  // TURBO 모드 사용
        console.log('🚀 TURBO 모드 활성화');
    }
    
    // 📸 미디어 파일 임시 저장 처리
    const tempImagePaths = [];
    
    // 이미지 파일 저장 또는 경로 변환
    for (let i = 0; i < images.length; i++) {
        console.log('=== [이미지 파일 저장 또는 경로 변환] ===');
        const image = images[i];
        if (image.url && image.url.startsWith('/temp/')) {
            // 업로드된 이미지라면 실제 경로로 변환 (항상 절대경로로)
            let absPath = path.join(__dirname, image.url.replace('/temp/', 'temp/'));
            absPath = path.resolve(absPath); // 절대경로 보장
            tempImagePaths.push(absPath);
        } else if (image.data) {
            // base64 데이터라면 기존 방식대로 저장
            try {
                const base64Data = image.data.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                let tempPath = path.join(__dirname, 'temp', `image_${Date.now()}_${i}.jpg`);
                tempPath = path.resolve(tempPath); // 절대경로 보장
                if (!fs.existsSync(path.join(__dirname, 'temp'))) {
                    fs.mkdirSync(path.join(__dirname, 'temp'));
                }
                fs.writeFileSync(tempPath, buffer);
                tempImagePaths.push(tempPath);
            } catch (error) {
                console.error(`📸 이미지 저장 실패:`, error);
            }
        }
    }
    // 로그 추가: 실제로 파이썬에 전달할 이미지 경로 확인
    console.log('자동화에 전달할 이미지 경로(절대경로):', tempImagePaths);

    // 인자 named argument로 변경
    const scriptPath = path.join(__dirname, scriptName);
    const pythonArgs = [
        scriptPath,
        '--username', username,
        '--password', password,
        '--content', postContent
    ];
    
    // 📸🎬 미디어 파일 경로 추가
    if (tempImagePaths.length > 0) {
        pythonArgs.push('--images');
        pythonArgs.push(...tempImagePaths);
    }
    
    console.log('videos 값:', videos);

    if (Array.isArray(videos) && videos.length > 0) {
        console.log('동영상 있는지 없는지 확인 중');
        console.log('동영상 있는지 없는지 확인 중 : ', videos);
        const videoUrls = videos.map(v => v.url);
        pythonArgs.push('--videos');
        pythonArgs.push(...videoUrls);
    } else {
        console.log('동영상 없는 상태 :', videos);
    }
    
    console.log('=== [SPAWN 직전 1] ===');
    // 설정에 따른 추가 인수
    if (settings) {
        if (settings.showBrowser === false) {
            pythonArgs.push('--headless');
        }
        if (settings.speed) {
            pythonArgs.push('--speed', settings.speed);
        }
        if (settings.manualWait) {
            pythonArgs.push('--manual-wait', settings.manualWait.toString());
        }
    }
    
    console.log('실제 파이썬 실행 인자:', pythonArgs);
    
    // 파이썬 실행 경로를 환경변수 또는 PATH에서 찾음
    const pythonExec = process.env.PYTHON_PATH || 'python';
    const pythonProcess = spawn(pythonExec, pythonArgs, {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    // 출력 스트림 처리
    pythonProcess.stdout.on('data', (data) => {
        const message = data.toString();
        output += message;
        console.log(`[게시물 ${postIndex + 1}] ${message.trim()}`);
        
        // 실시간 로그를 클라이언트에 전송 (WebSocket이 있다면)
        // io.emit('automation-log', { postIndex, message: message.trim() });
    });
    
    pythonProcess.stderr.on('data', (data) => {
        const error = data.toString();
        errorOutput += error;
        console.error(`[게시물 ${postIndex + 1} 오류] ${error.trim()}`);
    });
    
    // 프로세스 완료 처리
    pythonProcess.on('close', (code) => {
        console.log(`[게시물 ${postIndex + 1}] 프로세스 종료: ${code}`);
        
        // 📸 임시 파일 정리
        tempImagePaths.forEach(tempPath => {
            try {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                    console.log(`📸 임시 파일 삭제: ${tempPath}`);
                }
            } catch (error) {
                console.error(`📸 임시 파일 삭제 실패: ${tempPath}`, error);
            }
        });
        
        if (code === 0) {
            res.json({
                success: true,
                message: `게시물 ${postIndex + 1} 자동화 완료`,
                output: output,
                postIndex: postIndex
            });
        } else {
            res.json({
                success: false,
                error: `자동화 실패 (종료 코드: ${code})`,
                errorOutput: errorOutput,
                postIndex: postIndex
            });
        }
    });
    
    // 프로세스 오류 처리
    pythonProcess.on('error', (error) => {
        console.error(`[게시물 ${postIndex + 1}] 프로세스 오류:`, error);
        res.json({
            success: false,
            error: `프로세스 실행 오류: ${error.message}`,
            postIndex: postIndex
        });
    });
});

// 기존 단일 자동화 API
app.post('/api/automate', (req, res) => {
    console.log('=== [API /api/automate called] ===');
    const { username, password, postContent, images = [], settings, videos = [] } = req.body;
    
    console.log('자동화 요청 받음:', { username, postContentLength: postContent.length, imagesCount: images.length, videosCount: videos.length });
    console.log(`설정:`, { ...settings });
    
    const pythonArgs = [
        'automation_fixed.py',
        '--username', username,
        '--password', password,
        '--content', postContent
    ];
    if (settings) {
        if (settings.showBrowser === false) {
            pythonArgs.push('--headless');
        }
        if (settings.speed) {
            pythonArgs.push('--speed', settings.speed);
        }
        if (settings.manualWait) {
            pythonArgs.push('--manual-wait', settings.manualWait.toString());
        }
    }
    const imagePaths = images.map(img => typeof img === 'string' ? img : img.url).filter(Boolean);
    // 확장자 없는 파일은 .jpg로 붙여서 경로 변환
    const absImagePaths = imagePaths.map(p => {
        let absPath = p.startsWith('/temp/')
            ? path.join(__dirname, p.replace('/temp/', 'temp/'))
            : p;
        // 확장자 없으면 .jpg 붙이기
        if (path.extname(absPath) === '') {
            absPath = absPath + '.jpg';
        }
        return absPath;
    });
    // 이미지 경로 추가 예시
    if (images && images.length > 0) {
        console.log('이미지 있는지 없는지 확인 중');
        console.log('이미지 있는지 없는지 확인 중 : '+absImagePaths);
        pythonArgs.push('--images');
        pythonArgs.push(...absImagePaths);
    }
    console.log('videos 값:', videos);

    // videos 구분: 로컬(/temp/) vs 온라인
    const localVideos = [];
    const onlineVideos = [];
    if (Array.isArray(videos) && videos.length > 0) {
        videos.forEach(v => {
            if (v.url && v.url.startsWith('/temp/')) {
                // 로컬 파일: 절대경로로 변환
                let absPath = path.join(__dirname, v.url.replace('/temp/', 'temp/'));
                absPath = path.resolve(absPath);
                localVideos.push(absPath);
            } else if (v.url) {
                onlineVideos.push(v.url);
            }
        });
    }
    if (localVideos.length > 0) {
        pythonArgs.push('--videos-local');
        pythonArgs.push(...localVideos);
    }
    if (onlineVideos.length > 0) {
        pythonArgs.push('--videos-online');
        pythonArgs.push(...onlineVideos);
    }
    console.log('실제 파이썬 실행 인자:', pythonArgs);
    const pythonExec = process.env.PYTHON_PATH || 'python';
    const pythonProcess = spawn(pythonExec, pythonArgs, {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
        const message = data.toString();
        output += message;
        console.log('Python 출력:', message.trim());
    });
    
    pythonProcess.stderr.on('data', (data) => {
        const error = data.toString();
        errorOutput += error;
        console.error('Python 오류:', error.trim());
    });
    
    pythonProcess.on('close', (code) => {
        console.log(`Python 프로세스 종료: ${code}`);
        
        if (code === 0) {
            res.json({
                success: true,
                message: '자동화가 성공적으로 완료되었습니다.',
                output: output
            });
        } else {
            res.json({
                success: false,
                error: `자동화 실패 (종료 코드: ${code})`,
                errorOutput: errorOutput
            });
        }
    });
    
    pythonProcess.on('error', (error) => {
        console.error('프로세스 실행 오류:', error);
        res.json({
            success: false,
            error: `프로세스 실행 오류: ${error.message}`
        });
    });
});

// 🆕 설정 저장/불러오기 API
app.post('/api/settings', (req, res) => {
    const settings = req.body;
    
    try {
        fs.writeFileSync('automation_settings.json', JSON.stringify(settings, null, 2));
        console.log('설정이 저장되었습니다.');
        res.json({ success: true, message: '설정이 저장되었습니다.' });
    } catch (error) {
        console.log('설정 저장 실패: ' + error.message);
        res.json({ success: false, error: '설정 저장 실패: ' + error.message });
    }
});

app.get('/api/settings', (req, res) => {
    try {
        if (fs.existsSync('automation_settings.json')) {
            const settings = JSON.parse(fs.readFileSync('automation_settings.json', 'utf8'));
            console.log('설정이 불러왔습니다 : '+settings.showBrowser);
            res.json({ success: true, settings });
        } else {
            res.json({ success: true, settings: {} });
        }
    } catch (error) {
        res.json({ success: false, error: '설정 불러오기 실패: ' + error.message });
    }
});

// 🎬 YouTube 동영상 검색 API
app.get('/api/search-videos', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.json({ success: false, error: '검색어가 필요합니다.' });
    }
    try {
        const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'YOUR_API_KEY_HERE';
        if (YOUTUBE_API_KEY === 'YOUR_API_KEY_HERE') {
            return res.json({ success: false, error: 'YouTube API 키가 설정되지 않았습니다. .env 파일에 YOUTUBE_API_KEY를 설정해주세요.' });
        }
        const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(apiUrl);
        const data = await response.json();
        if (!data.items) {
            return res.json({ success: false, error: '검색 결과가 없습니다.' });
        }
        const videos = data.items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            channel: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails.medium.url,
            description: item.snippet.description
        }));
        res.json({ success: true, videos });
    } catch (error) {
        console.error('🎬 동영상 검색 오류:', error);
        res.json({ success: false, error: '동영상 검색 중 오류가 발생했습니다.' });
    }
});

// 🆕 Pro 버전 라우트
app.get('/pro', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index_pro.html'));
});

// 로그 조회 API
app.get('/api/logs', (req, res) => {
    try {
        const logFile = path.join(logDir, `automation_${new Date().toISOString().split('T')[0]}.log`);
        if (fs.existsSync(logFile)) {
            const logs = fs.readFileSync(logFile, 'utf8');
            const logLines = logs.split('\n').filter(line => line.trim()).slice(-50); // 최근 50줄
            res.json({ success: true, logs: logLines });
        } else {
            res.json({ success: true, logs: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '로그 조회 실패' });
    }
});

// 이미지 업로드 라우트 (multipart/form-data)
app.post('/api/upload-image', upload.single('image'), (req, res) => {
    // req.file.path: 실제 저장된 파일 경로 (확장자 없음)
    const oldPath = req.file.path;
    const newPath = `${oldPath}.jpg`;

    // 파일명에 .jpg 확장자 붙이기
    fs.rename(oldPath, newPath, (err) => {
        if (err) {
            return res.status(500).json({ success: false, error: '파일명 변경 실패' });
        }
        // 프론트엔드에 .jpg가 붙은 URL 반환
        res.json({ success: true, url: `/temp/${req.file.filename}.jpg` });
    });
});

// 동영상 업로드 라우트 (multipart/form-data)
app.post('/api/upload-video', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    // 확장자 없는 파일에 .mp4 등 확장자 붙이기 (여기선 .mp4로 가정)
    const oldPath = req.file.path;
    const newPath = `${oldPath}.mp4`;
    fs.rename(oldPath, newPath, (err) => {
        if (err) {
            return res.status(500).json({ success: false, error: '파일명 변경 실패' });
        }
        // 프론트엔드에 .mp4가 붙은 URL 반환
        res.json({ success: true, url: `/temp/${req.file.filename}.mp4` });
    });
});

// 서버 시작
app.listen(PORT, '0.0.0.0',() => {
    writeLog('INFO', `서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
    console.log('브라우저에서 위 주소로 접속하세요!');
});

module.exports = app; 