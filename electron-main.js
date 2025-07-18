// ===================== Electron 메인 프로세스 진입점 =====================
console.log('electron-main.js 실행');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;

// ===================== 앱 준비 완료 시 실행 =====================
app.whenReady().then(() => {
    createWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// ===================== 모든 창이 닫히면 앱 종료 (macOS 제외) =====================
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ===================== 메인 창 생성 함수 =====================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 1000,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false          // ★ 추가
        },
        icon: path.join(__dirname, 'public', 'icon.png'), // 아이콘이 있다면
        title: '🎬 YouTube 자동화 Pro'
    });
    console.log('preload path:', path.join(__dirname, 'preload.js'));
    // HTML 파일 로드
    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

    // 개발자 도구 (개발 시에만)
    // mainWindow.webContents.openDevTools();
}

// ===================== 자동화 실행 IPC 핸들러 =====================
ipcMain.handle('run-automation', async (event, automationData) => {
    try {
        console.log('🔍 [ELECTRON] 자동화 데이터 수신 - 디버깅 시작');
        console.log('📊 [ELECTRON] 수신된 데이터 타입 검사:');
        console.log('- automationData type:', typeof automationData);
        console.log('- automationData keys:', Object.keys(automationData || {}));
        
        // 안전한 구조분해할당
        let username, password, postContent, images, videos, settings, postIndex;
        
        try {
            ({ username, password, postContent, images, videos, settings, postIndex } = automationData || {});
            console.log('✅ [ELECTRON] 구조분해할당 성공');
        } catch (destructError) {
            console.error('❌ [ELECTRON] 구조분해할당 실패:', destructError);
            throw new Error(`구조분해할당 실패: ${destructError.message}`);
        }
        
        console.log('📊 [ELECTRON] 개별 데이터 검사:');
        console.log('- username:', typeof username, username);
        console.log('- password:', typeof password, password ? '***' : 'null');
        console.log('- postContent:', typeof postContent, postContent?.length);
        console.log('- images:', typeof images, Array.isArray(images), images?.length);
        if (images && Array.isArray(images)) {
            console.log('- images details:', images.map((img, i) => ({
                index: i,
                type: typeof img,
                keys: img ? Object.keys(img) : [],
                url: img?.url,
                name: img?.name
            })));
        }
        console.log('- videos:', typeof videos, Array.isArray(videos), videos?.length);
        console.log('- settings:', typeof settings, settings);
        console.log('- postIndex:', typeof postIndex, postIndex);
        
        console.log(`🚀 게시물 ${postIndex + 1} 자동화 시작`);
        console.log(`📸 이미지: ${images?.length || 0}개, 🎬 동영상: ${videos?.length || 0}개`);
        
        // 📸 이미지 파일 임시 저장
        const tempImagePaths = [];
        const tempDir = path.join(app.getPath('userData'), 'temp');
        
        console.log('tempDir:', tempDir, fs.existsSync(tempDir));
        if (fs.existsSync(tempDir)) {
            const stat = fs.statSync(tempDir);
            if (!stat.isDirectory()) {
                // 이미 파일이 있으면 삭제하거나, 에러 처리
                fs.unlinkSync(tempDir);
                fs.mkdirSync(tempDir);
            }
        } else {
            fs.mkdirSync(tempDir);
        }
        
        // 이미지 파일 처리 (Base64 데이터로 전달됨)
        if (images && images.length > 0) {
            console.log(`🔍 [ELECTRON] 이미지 처리 시작: ${images.length}개`);
            for (let i = 0; i < images.length; i++) {
                const imageData = images[i];
                console.log(`🔍 [ELECTRON] 이미지 ${i} 처리:`, {
                    type: typeof imageData,
                    isBase64: typeof imageData === 'string' && imageData.startsWith('data:image'),
                    length: typeof imageData === 'string' ? imageData.length : 'N/A'
                });
                
                if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
                    try {
                        // Base64 데이터를 파일로 저장
                        const base64Data = imageData.split(',')[1]; // data:image/jpeg;base64, 부분 제거
                        const buffer = Buffer.from(base64Data, 'base64');
                        const fileName = `image_${Date.now()}_${i}.jpg`;
                        const filePath = path.join(tempDir, fileName);
                        
                        fs.writeFileSync(filePath, buffer);
                        tempImagePaths.push(filePath);
                        console.log(`✅ [ELECTRON] Base64 이미지 저장됨: ${filePath}`);
                    } catch (error) {
                        console.error(`❌ [ELECTRON] Base64 이미지 저장 실패:`, error);
                    }
                } else if (typeof imageData === 'string' && imageData.startsWith('temp/')) {
                    // 기존 경로 방식 (하위 호환성)
                    try {
                        let filePath;
                        
                        // 여러 가능한 위치에서 찾기
                        const possiblePaths = [
                            path.join(__dirname, imageData),
                            path.join(__dirname, '..', imageData),
                            path.join(__dirname, '..', '..', imageData),
                            path.join(process.cwd(), imageData),
                            path.join(process.cwd(), '..', imageData)
                        ];
                        
                        filePath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];
                        
                        if (fs.existsSync(filePath)) {
                            tempImagePaths.push(filePath);
                            console.log(`✅ [ELECTRON] 경로 이미지 추가됨: ${filePath}`);
                        } else {
                            console.log(`❌ [ELECTRON] 경로 이미지 파일이 존재하지 않음: ${filePath}`);
                        }
                    } catch (error) {
                        console.error(`❌ [ELECTRON] 경로 이미지 처리 실패:`, error);
                    }
                } else {
                    console.log(`⚠️ [ELECTRON] 이미지 ${i}: 지원하지 않는 형식 - ${typeof imageData}`);
                }
            }
        } else {
            console.log(`ℹ️ [ELECTRON] 이미지 없음`);
        }
        
        // Python 스크립트 실행 준비
        const scriptName = 'automation_fixed.py';
        console.log('scriptName:', scriptName);
        // 빌드된 앱에서는 process.resourcesPath/python/...
        const pythonDir = process.env.NODE_ENV === 'development'
          ? path.join(__dirname, 'python')
          : path.join(process.resourcesPath, 'python');
        const pythonExe = path.join(pythonDir, 'python.exe');
        const script = path.join(pythonDir, scriptName);
        console.log('script:', script);
        console.log('pythonDir:', pythonDir);
        const pythonArgs = [
            script,
            '--username', username,
            '--password', password,
            '--content', postContent
        ];
        console.log('pythonArgs:', pythonArgs);
        console.log('tempImagePaths:', tempImagePaths);
        // 📸🎬 미디어 파일 경로 추가
        if (tempImagePaths.length > 0) {
            console.log('🔍 [ELECTRON] Python으로 전달할 이미지 경로들:');
            tempImagePaths.forEach((path, idx) => {
                console.log(`  이미지 ${idx}: ${path}`);
                console.log(`  파일 존재 여부: ${fs.existsSync(path)}`);
                if (fs.existsSync(path)) {
                    const stats = fs.statSync(path);
                    console.log(`  파일 크기: ${stats.size} bytes`);
                }
            });
            pythonArgs.push('--images', ...tempImagePaths);
        }
        
        if (videos.length > 0) {
            const videoUrls = videos.map(v => v.url || v);
            pythonArgs.push('--videos', ...videoUrls);
        }
        
        // 설정 추가
        if (settings && settings.showBrowser === false) {
            pythonArgs.push('--headless');
        }
        if (settings && settings.browserSpeed) {
            pythonArgs.push('--speed', settings.browserSpeed);
        }
        
        console.log('🐍 Python 실행 인자:');
        console.log('  전체 명령어:', pythonArgs.join(' '));
        console.log('  인자 개수:', pythonArgs.length);
        pythonArgs.forEach((arg, idx) => {
            console.log(`  인자 ${idx}: ${arg}`);
        });
        
        // Python 스크립트 실행
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn(pythonExe, pythonArgs, {
                cwd: pythonDir,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            console.log('pythonExe:', pythonExe);
            let output = '';
            let errorOutput = '';
            
            pythonProcess.stdout.on('data', (data) => {
                const message = data.toString();
                output += message;
                console.log(`[Python] ${message.trim()}`);
                
                // 렌더러 프로세스에 실시간 로그 전송
                mainWindow.webContents.send('automation-log', {
                    postIndex,
                    message: message.trim(),
                    type: 'info'
                });
            });
            
            pythonProcess.stderr.on('data', (data) => {
                const error = data.toString();
                errorOutput += error;
                console.error(`[Python Error] ${error.trim()}`);
                
                mainWindow.webContents.send('automation-log', {
                    postIndex,
                    message: error.trim(),
                    type: 'error'
                });
            });
            
            pythonProcess.on('close', (code) => {
                console.log(`[Python] 프로세스 종료: ${code}`);
                
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
                    resolve({
                        success: true,
                        message: `게시물 ${postIndex + 1} 자동화 완료`,
                        output: output
                    });
                } else {
                    resolve({
                        success: false,
                        error: `자동화 실패 (종료 코드: ${code})`,
                        errorOutput: errorOutput
                    });
                }
            });
            
            pythonProcess.on('error', (error) => {
                console.error(`[Python] 프로세스 오류:`, error);
                
                // 임시 파일 정리
                tempImagePaths.forEach(tempPath => {
                    try {
                        if (fs.existsSync(tempPath)) {
                            fs.unlinkSync(tempPath);
                        }
                    } catch (error) {
                        console.error(`임시 파일 정리 실패:`, error);
                    }
                });
                
                resolve({
                    success: false,
                    error: `프로세스 실행 오류: ${error.message}`
                });
            });
        });
        
    } catch (error) {
        console.error('❌ [ELECTRON] 자동화 핸들러 오류:', error);
        console.error('❌ [ELECTRON] 오류 스택:', error.stack);
        console.error('❌ [ELECTRON] 오류 이름:', error.name);
        console.error('❌ [ELECTRON] 오류 메시지:', error.message);
        
        // 오류 타입 분석
        if (error.message && error.message.includes('cloned')) {
            console.error('🔍 [ELECTRON] 클론 오류 감지 - 가능한 원인:');
            console.error('- File 객체나 Blob 객체가 포함되어 있음');
            console.error('- 순환 참조가 있는 객체');
            console.error('- 함수나 Symbol이 포함된 객체');
        }
        console.error('🚨 자동화 실행 오류:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

// ===================== 파일 다이얼로그 열기 IPC 핸들러 =====================
ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp'] }
        ]
    });
    
    return result;
});

// ===================== 앱 정보 표시 IPC 핸들러 =====================
ipcMain.handle('show-about', async () => {
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '정보',
        message: '🎬 YouTube 자동화 Pro',
        detail: '버전: 2.0.0\n개발자: AI Assistant\n\n📸 이미지 업로드 지원\n🎬 동영상 검색 및 추가\n💾 게시물 자동 저장\n🚀 다중 게시물 자동화'
    });
}); 