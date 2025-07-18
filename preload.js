// ===================== preload.js: Electron 렌더러와 메인 브릿지 =====================
console.log('fs in preload is', typeof require === 'function' ? 'OK' : 'MISSING');
const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
console.log('fs module loaded in preload.js');
const path = require('path');
const os = require('os');
const NEWLINE = os.EOL;

// 렌더러 프로세스에서 사용할 수 있는 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
    // 🚀 자동화 실행
    runAutomation: (automationData) => ipcRenderer.invoke('run-automation', automationData),
    
    // 📸 파일 다이얼로그 열기
    openFileDialog: async () => {
        return await ipcRenderer.invoke('open-file-dialog');
    },
    
    // ℹ️ 앱 정보 표시
    showAbout: async () => {
        return await ipcRenderer.invoke('show-about');
    },
    
    // 📋 실시간 로그 수신
    onAutomationLog: (callback) => ipcRenderer.on('automation-log', (_event, data) => callback(data)),
    
    // 📋 로그 리스너 제거
    removeAutomationLogListener: () => {
        ipcRenderer.removeAllListeners('automation-log');
    }
});

// ===================== 계정 파일 경로 상수 =====================
const ACCOUNTS_PATH = path.join(process.resourcesPath, 'accounts.txt');

if (!fs.existsSync(ACCOUNTS_PATH)) fs.writeFileSync(ACCOUNTS_PATH, '', 'utf8');

// ===================== 계정 관리 API 노출 =====================
contextBridge.exposeInMainWorld('accountAPI', {
  readAccounts: () => {
    if (!fs.existsSync(ACCOUNTS_PATH)) return [];
    const data = fs.readFileSync(ACCOUNTS_PATH, 'utf-8');
    return data.split('\n').filter(Boolean).map(line => {
      const [id, name, username, password, description, user_id, createdAt, updatedAt] = line.split(',');
      return { id, name, username, password, description, user_id, createdAt, updatedAt };
    });
  },
  addAccount: (account) => {
    const line = [
      account.id,
      account.name,
      account.username,
      account.password,
      account.description,
      account.user_id,
      account.createdAt,
      account.updatedAt
    ].join(',') + NEWLINE;
    fs.appendFileSync(ACCOUNTS_PATH, line, 'utf8');
  },
  overwriteAccounts: (accounts) => {
    const lines = accounts.map(acc =>
      [acc.id, acc.name, acc.username, acc.password, acc.description, acc.user_id, acc.createdAt, acc.updatedAt].join(',')
    ).join(NEWLINE) + NEWLINE;
    fs.writeFileSync(ACCOUNTS_PATH, lines, 'utf8');
  }
});

// ===================== 콘솔에 API 로드 확인 메시지 =====================
console.log('🔌 Electron API 로드 완료');
console.log('�� 앱 환경에서 실행 중입니다.'); 