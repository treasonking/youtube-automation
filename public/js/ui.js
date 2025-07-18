// UI 관련 함수들

// ===================== 탭 전환 함수 =====================
export function switchTab(tabName, event) {
    // 탭 버튼 및 탭 콘텐츠 활성화/비활성화 처리
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    if (event) event.target.classList.add('active');
    document.getElementById(tabName).classList.add('active');
}
window.switchTab = switchTab;

// ===================== 커스텀 알림(모달) 표시 =====================
export function showCustomAlert(msg, onClose) {
    // 커스텀 알림 모달을 띄우고, 확인 버튼 클릭 시 onClose 콜백 실행
    const alertDiv = document.getElementById('customAlert');
    const msgDiv = document.getElementById('customAlertMsg');
    const btn = document.getElementById('customAlertBtn');
    msgDiv.textContent = msg;
    alertDiv.style.display = 'flex';
    btn.focus();
    btn.onclick = () => {
        alertDiv.style.display = 'none';
        if (onClose) onClose();
    };
}

// ===================== 진행률 표시 =====================
export function updateProgress(percentage, text) {
    // 진행률 바와 상태 텍스트를 갱신
    document.getElementById('progressFill').style.width = percentage + '%';
    document.getElementById('statusText').textContent = text;
}

// ===================== 로그 추가 =====================
export function addLog(message) {
    // 로그 영역에 메시지 추가 (타임스탬프 포함)
    const logEntries = document.getElementById('logEntries');
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.textContent = `[${timestamp}] ${message}`;
    logEntries.appendChild(logEntry);
    
    // 스크롤을 맨 아래로
    logEntries.scrollTop = logEntries.scrollHeight;
}

// ===================== 로그 초기화 =====================
export function clearLogs() {
    // 로그 영역을 초기화
    document.getElementById('logEntries').innerHTML = '<div class="log-entry">자동화 시작을 기다리는 중...</div>';
}

// ===================== 설정 저장 =====================
export function saveSettings() {
    // 설정값을 localStorage와 서버에 저장
    const settings = {
        showBrowser: document.getElementById('showBrowser').checked,
        maximizeWindow: document.getElementById('maximizeWindow').checked,
        browserSpeed: document.getElementById('browserSpeed').value,
        postDelay: parseInt(document.getElementById('postDelay').value),
        manualPostWait: parseInt(document.getElementById('manualPostWait').value),
        autoRetry: document.getElementById('autoRetry').checked,
        skipOnError: document.getElementById('skipOnError').checked,
        closeOnComplete: document.getElementById('closeOnComplete').checked,
        detailedLogs: document.getElementById('detailedLogs').checked,
        saveLogsToFile: document.getElementById('saveLogsToFile').checked
    };
    try {
        // 서버 API를 사용할 수 없는 환경을 위해 localStorage에도 저장
        localStorage.setItem('automation_settings', JSON.stringify(settings));
        showCustomAlert('설정이 저장되었습니다.');
    } catch(e) {
        console.error('saveSettings error', e);
        showCustomAlert('설정 저장 실패: ' + (e.message || '알 수 없는 오류'));
    }
}

// HTML에서 직접 호출할 수 있도록
window.saveSettings = saveSettings;

// ===================== 기타 UI/모달 관련 함수들 export =====================
window.addLog = addLog; 