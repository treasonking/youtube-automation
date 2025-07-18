// main.js: 앱 초기화, 이벤트 바인딩, 각 모듈 import 및 연결
// ===================== 모듈 import =====================
import * as Auth from './auth.js'; // 인증 관련 모듈
import * as Posts from './posts.js'; // 게시물 관련 모듈
import * as Accounts from './accounts.js'; // 계정 관련 모듈
import * as Media from './media.js'; // 미디어(이미지/동영상) 관련 모듈
import * as UI from './ui.js'; // UI 관련 모듈
import { saveEditedPost } from './media.js'; // 게시물 수정 저장 함수 (위치에 따라 posts.js 등에서 import할 수도 있음)
window.saveEditedPost = saveEditedPost; // 전역에서 접근 가능하도록 바인딩
import { closeEditPostModal } from './posts.js'; // 게시물 수정 모달 닫기 함수
import { API_BASE } from './config.js'; // API 서버 주소 상수
window.closeEditPostModal = closeEditPostModal; // 전역 바인딩

// ===================== 전역 변수 선언 =====================
window.posts = []; // 게시물 목록 (전역)
window.accounts = []; // 계정 목록 (전역)
window.selectedImages = []; // 선택된 이미지 목록 (전역)
window.selectedVideos = []; // 선택된 동영상 목록 (전역)
// ... 기타 필요한 전역 변수 ...
window.editPost = Posts.editPost; // 게시물 수정 함수 전역 바인딩
window.addLog = UI.addLog; // 로그 추가 함수 전역 바인딩

// ===================== DOMContentLoaded: 앱 초기화 =====================
document.addEventListener('DOMContentLoaded', function() {
    // Electron 환경이 아니면 경고 표시
    console.log(typeof window.electronAPI.json);
    if (typeof window.electronAPI === 'undefined') {
        // Electron 환경이 아님을 사용자에게 알림
        UI.showCustomAlert('이 앱은 반드시 Electron으로 실행해야 합니다. 브라우저에서 직접 열면 동작하지 않습니다.', () => {
            document.getElementById('authModal').style.display = 'flex';
            document.getElementById('mainUI').style.display = 'none';
        });
    }
    
    // 저장된 설정(localStorage) 불러오기
    const savedSettings = localStorage.getItem('automation_settings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        Object.keys(settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = settings[key];
                } else {
                    element.value = settings[key];
                }
            }
        });
    }
    
    // 게시물 목록 갱신
    Posts.updatePostList();
    
    // Electron 환경에서 실시간 로그 수신 설정
    if (typeof window.electronAPI !== 'undefined') {
        console.log('📱 Electron 앱 환경 감지');
        // 실시간 로그 수신: Python 자동화 로그를 받아서 UI에 표시
        window.electronAPI.onAutomationLog((logData) => {
            const { postIndex, message, type } = logData;
            if (type === 'error') {
                addLog(`❌ [게시물 ${postIndex + 1}] ${message}`);
            } else {
                addLog(`📝 [게시물 ${postIndex + 1}] ${message}`);
            }
        });
    } else {
        console.log('🌐 브라우저 환경 감지');
    }
}); 

// ===================== 서버 설정 불러오기 (비동기) =====================
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // 서버에서 설정값을 불러와서 UI에 반영
        const res = await fetch(`${API_BASE}/settings`);
        const data = await res.json();
        if (data.success && data.settings) {
            const settings = data.settings;
            console.log('설정이 불러왔습니다 : ' + settings.showBrowser);
            console.log('설정:', settings); // 값 확인
            Object.keys(settings).forEach(key => {
                const element = document.getElementById(key);
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = settings[key];
                    } else {
                        element.value = settings[key];
                    }
                }
            });
        }
    } catch (e) {
        // 서버 설정 불러오기 실패 시 무시
    }
});

// ===================== 게시물/계정/폼 이벤트 바인딩 =====================
document.addEventListener('DOMContentLoaded', function() {
    // 게시물 추가 버튼 클릭 이벤트
    var addPostBtn = document.getElementById('addPostBtn');
    if (addPostBtn) {
        addPostBtn.onclick = async function() {
            const content = document.getElementById('newPostContent').value.trim();
            const accountId = document.getElementById('postAccount').value;
            if (!content) {
                UI.showCustomAlert('게시물 내용을 입력하세요.', () => {
                    document.getElementById('newPostContent').focus();
                });
                return;
            }
            if (!accountId) {
                UI.showCustomAlert('계정을 선택하세요.', () => {
                    document.getElementById('postAccount').focus();
                });
                return;
            }
            await Posts.addPost({ content, accountId });
        };
    }
    // 계정 폼 제출 이벤트 (추가/수정)
    var accountForm = document.getElementById('accountForm');
    if (accountForm) {
        accountForm.onsubmit = async function(e) {
            e.preventDefault();
            if (Accounts.editingAccountId) {
                await Accounts.updateAccount(Accounts.editingAccountId);
            } else {
                await Accounts.addAccount();
            }
        };
    }
    // 게시물 폼 제출 이벤트 (추가/수정)
    var postForm = document.getElementById('postForm');
    if (postForm) {
        postForm.onsubmit = async function(e) {
            e.preventDefault();
            if (Posts.editingPostId) {
                await Posts.updatePost(Posts.editingPostId);
            } else {
                const content = document.getElementById('newPostContent').value.trim();
                const accountId = document.getElementById('postAccount').value;
                await addPost({ content, accountId });
            }
        };
    }
    // 계정 수정 취소 버튼
    var cancelEditBtn = document.getElementById('cancelEditBtn');
    if (cancelEditBtn) cancelEditBtn.onclick = Accounts.clearAccountForm;
    // ... 기타 버튼도 모두 if (btn) ... 형태로만 연결

// ===================== 안전한 API 호출 래퍼 =====================
async function safeApiCall(apiFunc) {
    try {
        return await apiFunc();
    } catch (e) {
        if (e && (e.status === 401 || e.status === 403)) {
            await window.supabase.auth.signOut();
            Auth.checkAuth();
        }
        throw e;
    }
}
// ===================== 인증 상태 확인 =====================
try {
    document.addEventListener('DOMContentLoaded', function() {
      console.log("DOMContentLoaded fired");
      Auth.checkAuth(); // 인증 상태 확인 및 UI 갱신
    });
  } catch (e) {
    console.error("app.js top-level error", e);
  }
// ===================== 계정/게시물 목록 불러오기 =====================
Accounts.loadAccounts();
Posts.loadPosts();
// ===================== 로그인 폼 제출 이벤트 =====================
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.onsubmit = async function(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        const { error } = await window.supabase.auth.signInWithPassword({ email, password });
        if (error) {
            document.getElementById('authError').textContent = error.message;
            document.getElementById('authError').style.display = 'block';
        } else {
            document.getElementById('authError').style.display = 'none';
            Auth.checkAuth();
            await Accounts.loadAccounts();
            await Posts.loadPosts();
        }
    };
}
// ===================== 회원가입 버튼 클릭 이벤트 =====================
const signupBtn = document.getElementById('signupBtn');
if (signupBtn) {
    signupBtn.onclick = async function() {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        if (!email || !password) {
            document.getElementById('authError').textContent = '이메일과 비밀번호를 입력하세요.';
            document.getElementById('authError').style.display = 'block';
            return;
        }
        const { error } = await window.supabase.auth.signUp({ email, password });
        if (error) {
            document.getElementById('authError').textContent = error.message;
            document.getElementById('authError').style.display = 'block';
        } else {
            document.getElementById('authError').textContent = '회원가입 성공! 이메일 인증 후 로그인하세요.';
            document.getElementById('authError').style.display = 'block';
        }
    };
}
// ===================== 로그아웃 버튼 동적 생성 및 이벤트 =====================
let logoutBtn = document.getElementById('logoutBtn');
if (!logoutBtn) {
    logoutBtn = document.createElement('button');
    logoutBtn.id = 'logoutBtn';
    logoutBtn.className = 'btn btn-secondary';
    logoutBtn.textContent = '로그아웃';
    logoutBtn.style = 'position:fixed;top:20px;right:30px;z-index:2000;display:none;';
    document.body.appendChild(logoutBtn);
}
logoutBtn.onclick = async function() {
    await window.supabase.auth.signOut();
    Auth.checkAuth();
};
// ===================== Supabase Auth 상태 변화 감지 =====================
window.supabase.auth.onAuthStateChange((_event, _session) => {
    Auth.checkAuth();
    Accounts.loadAccounts();
    Posts.loadPosts();
});
// ===================== 최초 상태 확인 =====================
});