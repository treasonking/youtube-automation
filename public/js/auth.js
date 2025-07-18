// 인증 관련 함수 및 이벤트
// auth.js는 로그인/회원가입/로그아웃 등 인증 UI 및 상태 관리를 담당합니다.

// 인증 상태 확인 함수
export async function checkAuth() {
    try {
        // Supabase 세션 정보 가져오기
        const { data: { session } } = await window.supabase.auth.getSession();
        if (session && session.user) {
            // 로그인 상태: 메인 UI 표시, 로그아웃 버튼 표시
            document.getElementById('authModal').style.display = 'none';
            document.getElementById('mainUI').style.display = 'block';
            document.getElementById('logoutBtn').style.display = 'inline-block';
        } else {
            // 비로그인 상태: 로그인 모달 표시
            document.getElementById('authModal').style.display = 'flex';
            document.getElementById('mainUI').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'none';
        }
    } catch (e) {
        // 예외 발생 시 로그인 모달 표시
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('mainUI').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
    }
}

// 인증이 필요한 API 호출 시 안전하게 처리
export async function safeApiCall(apiFunc) {
    try {
        return await apiFunc();
    } catch (e) {
        // 인증 만료(401/403) 시 자동 로그아웃 및 인증 상태 갱신
        if (e && (e.status === 401 || e.status === 403)) {
            await window.supabase.auth.signOut();
            checkAuth();
        }
        throw e;
    }
}

// 인증 관련 이벤트 바인딩(로그인, 회원가입, 로그아웃 등)
export function bindAuthEvents() {
    // 로그인 폼 제출 이벤트
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.onsubmit = async function(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value.trim();
            // Supabase 로그인 시도
            const { error } = await window.supabase.auth.signInWithPassword({ email, password });
            if (error) {
                document.getElementById('authError').textContent = error.message;
                document.getElementById('authError').style.display = 'block';
            } else {
                document.getElementById('authError').style.display = 'none';
                checkAuth();
            }
        };
    }
    // 회원가입 버튼 이벤트
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
            // Supabase 회원가입 시도
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
    // 로그아웃 버튼 동적 생성 및 이벤트 바인딩
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
        checkAuth();
    };
    // Supabase Auth 상태 변화 감지하여 UI 갱신
    window.supabase.auth.onAuthStateChange((_event, _session) => {
        checkAuth();
    });
} 