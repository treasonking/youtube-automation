const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
require('./server'); // server.js의 모든 라우트 사용

let mainWindow = null;

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

// Electron 앱 생성
async function createWindow() {
    // 메인 윈도우 생성
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets', 'icon.png'), // 아이콘 설정 (선택사항)
        title: 'YouTube 게시물 자동화 도구',
        show: false // 로딩 완료 후 표시
    });

    // 윈도우 로드 완료 후 표시
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        writeLog('INFO', 'Electron 앱 시작 완료');
    });

    // 로컬 서버 로드
    mainWindow.loadURL('http://localhost:3000');

    // 개발자 도구 (개발 모드에서만)
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    // 외부 링크를 기본 브라우저에서 열기
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // 윈도우 닫기 이벤트
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// 앱 이벤트 처리
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// 메뉴 생성
function createMenu() {
    const template = [
        {
            label: '파일',
            submenu: [
                {
                    label: '종료',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click() {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: '보기',
            submenu: [
                { role: 'reload', label: '새로고침' },
                { role: 'forcereload', label: '강제 새로고침' },
                { role: 'toggledevtools', label: '개발자 도구' },
                { type: 'separator' },
                { role: 'resetzoom', label: '확대/축소 초기화' },
                { role: 'zoomin', label: '확대' },
                { role: 'zoomout', label: '축소' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: '전체화면' }
            ]
        },
        {
            label: '도움말',
            submenu: [
                {
                    label: '정보',
                    click() {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: '정보',
                            message: 'YouTube 게시물 자동화 도구',
                            detail: 'Version 1.0.0\n\nNode.js + Python으로 제작된 YouTube 자동화 도구입니다.'
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
    createMenu();
}); 