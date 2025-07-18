// 계정 관련 함수들
// accounts.js는 YouTube 자동화 도구의 계정 관리(추가, 수정, 삭제, 목록, 검색 등) 기능을 담당합니다.

let accountSearchKeyword = '';
export let editingAccountId = null;
let accounts = [];
import * as UI from './ui.js';
import { API_BASE } from './config.js';

// 계정 추가 함수
export async function addAccount() {
    // 입력값 읽기
    const name = document.getElementById('accountName').value.trim();
    const username = document.getElementById('accountUsername').value.trim();
    const password = document.getElementById('accountPassword').value.trim();
    const description = document.getElementById('accountDescription').value.trim();

    // 필수 입력값 검증
    if (!name || !username || !password) {
        UI.showCustomAlert('계정명, 아이디, 비밀번호는 필수 입력 항목입니다.');
        return;
    }

    // txt 저장용 계정 객체 생성
    const account = {
        id: Date.now().toString(),
        name,
        username,
        password,
        description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    try {
        // Electron API로 계정 추가
        window.accountAPI.addAccount(account);
        UI.showCustomAlert('계정이 추가되었습니다.');
        await loadAccounts(); // 계정 목록 새로고침
        clearAccountForm();  // 폼 초기화
    } catch (e) {
        console.error('addAccount error', e);
        UI.showCustomAlert('계정 추가 실패: ' + (e.message || '알 수 없는 오류'));
    }
}

// 계정 수정 함수
export async function updateAccount(accountId) {
    // 입력값 읽기
    const name = document.getElementById('accountName').value.trim();
    const username = document.getElementById('accountUsername').value.trim();
    const password = document.getElementById('accountPassword').value.trim();
    const description = document.getElementById('accountDescription').value.trim();

    // 필수 입력값 검증
    if (!name || !username || !password) {
        UI.showCustomAlert('계정명, 아이디, 비밀번호는 필수 입력 항목입니다.');
        return;
    }

    try {
        // 기존 계정 목록에서 해당 계정 찾기
        const accs = window.accountAPI.readAccounts();
        const idx = accs.findIndex(acc => acc.id === accountId);
        if (idx === -1) {
            UI.showCustomAlert('계정을 찾을 수 없습니다.');
            return;
        }
        // 계정 정보 수정
        accs[idx] = {
            ...accs[idx],
            name,
            username,
            password,
            description,
            updatedAt: new Date().toISOString()
        };
        window.accountAPI.overwriteAccounts(accs);
        UI.showCustomAlert('계정이 수정되었습니다.');
        await loadAccounts(); // 목록 새로고침
        clearAccountForm();  // 폼 초기화
    } catch (e) {
        console.error('updateAccount error', e);
        UI.showCustomAlert('계정 수정 실패: ' + (e.message || '알 수 없는 오류'));
    }
}

// 계정 삭제 함수
export async function deleteAccount(accountId) {
    if (!confirm('정말로 삭제하시겠습니까?')) return;
    try {
        // 계정 목록에서 해당 계정 제거
        let accs = window.accountAPI.readAccounts();
        accs = accs.filter(acc => acc.id !== accountId);
        window.accountAPI.overwriteAccounts(accs);
        UI.showCustomAlert('계정이 삭제되었습니다.');
        await loadAccounts(); // 목록 새로고침
    } catch (e) {
        console.error('deleteAccount error', e);
        UI.showCustomAlert('계정 삭제 실패: ' + (e.message || '알 수 없는 오류'));
    }
}

// 계정 목록 불러오기 및 UI 갱신
export async function loadAccounts() {
    try {
        // 계정 파일에서 목록 읽기 및 유효성 검증
        accounts = (window.accountAPI.readAccounts() || []).filter(acc => acc && acc.name && acc.username);
        // 잘못된 레코드가 있으면 파일에서 제거
        window.accountAPI.overwriteAccounts(accounts);
    } catch (e) {
        console.error('loadAccounts error', e);
        accounts = [];
    }
    window.accounts = accounts; // 전역에 반영
    updateAccountList();
    updateAccountDropdown();
    updateAccountCount();
}

// 계정 목록 UI 업데이트
export function updateAccountList() {
    const accountList = document.getElementById('accountList');
    let filteredAccounts = accounts.filter(acc => acc && acc.name && acc.username);
    // 검색어 필터 적용
    if (accountSearchKeyword) {
        filteredAccounts = accounts.filter(acc =>
            (acc.name && acc.name.includes(accountSearchKeyword)) ||
            (acc.username && acc.username.includes(accountSearchKeyword))
        );
    }
    // 계정이 없을 때 안내 메시지
    if (filteredAccounts.length === 0) {
        accountList.innerHTML = `
            <p style="text-align: center; color: #666; font-style: italic;">
                아직 등록된 계정이 없습니다.<br>
                위에서 계정을 추가해보세요!
            </p>
        `;
        return;
    }
    // 계정 목록 렌더링
    accountList.innerHTML = filteredAccounts.map(account => `
        <div class="post-item">
            <div class="post-content">
                <h4>👤 ${account.name}</h4>
                <p><strong>아이디:</strong> ${account.username}</p>
                <p><strong>비밀번호:</strong> ${account.password ? '*'.repeat(account.password.length) : '(없음)'}</p>
                ${account.description ? `<p><strong>설명:</strong> ${account.description}</p>` : ''}
                <p style="font-size: 12px; color: #999;">
                    생성일: ${new Date(account.createdAt).toLocaleString('ko-KR')}
                </p>
            </div>
            <div class="post-actions">
                <button class="btn btn-secondary" onclick="editAccount('${account.id}')">
                    ✏️ 수정
                </button>
                <button class="btn btn-danger" onclick="deleteAccount('${account.id}')">
                    🗑️ 삭제
                </button>
            </div>
        </div>
    `).join('');
}

// 저장된 계정 수 UI 업데이트
export function updateAccountCount() {
    const accountCount = document.getElementById('accountCount');
    if (accountCount) {
        accountCount.textContent = `💾 저장된 계정: ${accounts.length}개`;
    }
}

// 게시물 작성 폼의 계정 선택 드롭다운 갱신
export function updateAccountDropdown() {
    const postAccount = document.getElementById('postAccount');
    // 기존 옵션 제거 (첫 번째 옵션 제외)
    const prevValue = postAccount.value;
    while (postAccount.children.length > 1) {
        postAccount.removeChild(postAccount.lastChild);
    }
    // 계정 옵션 추가
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = `${account.name} (${account.username})`;
        postAccount.appendChild(option);
    });
    // 기존 선택값 복원
    if (prevValue && Array.from(postAccount.options).some(opt => opt.value === prevValue)) {
        postAccount.value = prevValue;
    }
}

// 계정 추가/수정 폼 초기화
export function clearAccountForm() {
    document.getElementById('accountForm').reset();
    editingAccountId = null;
    document.getElementById('cancelEditBtn').style.display = 'none';
    const submitBtn = document.getElementById('accountSubmitBtn');
    if (submitBtn) submitBtn.textContent = '➕ 계정 추가';
}

// 계정 정보 로컬스토리지에 저장
export function saveAccounts() {
    try {
        localStorage.setItem('youtube_accounts', JSON.stringify(accounts));
        console.log('계정 저장 완료:', accounts.length + '개');
        updateAccountCount();
    } catch (error) {
        console.error('계정 저장 실패:', error);
        UI.showCustomAlert('계정 저장에 실패했습니다. 브라우저 저장 공간을 확인해주세요.');
    }
}

// 계정 수정 모드 진입 및 폼에 데이터 반영
export function editAccount(accountId) {
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) return;

    editingAccountId = accountId;
    
    // 폼에 기존 데이터 설정
    document.getElementById('accountName').value = account.name;
    document.getElementById('accountUsername').value = account.username;
    document.getElementById('accountPassword').value = account.password;
    document.getElementById('accountDescription').value = account.description;

    // UI 변경
    document.getElementById('cancelEditBtn').style.display = 'inline-block';
    const submitBtn = document.getElementById('accountSubmitBtn');
    if (submitBtn) submitBtn.textContent = '💾 계정 수정';

    // 계정 관리 탭으로 이동
    switchTab('accounts');
    
    // 폼으로 스크롤
    document.getElementById('accountForm').scrollIntoView({ behavior: 'smooth' });
}

// 모든 게시물 삭제 (DB, 로컬 모두)
export function clearAllPosts() {
    if (confirm('모든 게시물을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
        (async () => {
            const user = (await window.supabase.auth.getUser()).data.user;
            if (!user) {
                UI.showCustomAlert('로그인 후 이용하세요.');
                return;
            }
            const user_id = user.id;
            const { error } = await window.supabase
                .from('posts')
                .delete()
                .eq('user_id', user_id);
            if (error) {
                UI.showCustomAlert('DB에서 게시물 삭제 실패: ' + error.message);
                return;
            }
            posts = [];
            savePosts();
            updatePostList();
            showStatus('success', '모든 게시물이 삭제되었습니다! 💾');
        })();
    }
}

// 계정 API 호출 (Electron 또는 브라우저)
export async function addAccountAPI(accountData) {
    try {
        const res = await fetch(`${API_BASE}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(accountData)
        });
        alert(res.status);
        alert(res.statusText);
        return await res.json();
    } catch (error) {
        UI.showCustomAlert('계정 추가 실패: 앱을 반드시 Electron(아이콘 더블클릭 또는 npm run electron)으로 실행하세요. 브라우저에서 직접 열면 동작하지 않습니다.', () => {
            document.getElementById('authModal').style.display = 'flex';
            document.getElementById('mainUI').style.display = 'none';
        });
        return { success: false };
    }
}

// 계정 검색어 필터 적용
export function filterAccounts() {
    accountSearchKeyword = document.getElementById('accountSearchInput').value.trim();
    updateAccountList();
}

// 계정 검색어 필터 초기화
export function clearAccountSearch() {
    accountSearchKeyword = '';
    document.getElementById('accountSearchInput').value = '';
    updateAccountList();
}

// 계정 수정 폼의 계정 선택 드롭다운 갱신
export function updateEditAccountDropdown() {
    const editPostAccount = document.getElementById('editPostAccount');
    
    // 기존 옵션 제거 (첫 번째 옵션 제외)
    while (editPostAccount.children.length > 1) {
        editPostAccount.removeChild(editPostAccount.lastChild);
    }

    // 계정 옵션 추가
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = `${account.name} (${account.username})`;
        editPostAccount.appendChild(option);
    });

    // ❌ updateEditAccountDropdown();  // 이 줄을 반드시 삭제!
}
// 기타 계정 관련 함수들 export 
// 기타 계정 관련 함수들 export 
// 전역 바인딩: HTML onclick에서 직접 호출할 수 있게 함
window.addAccount = addAccount;
window.updateAccount = updateAccount;
window.deleteAccount = deleteAccount;
window.editAccount = editAccount;
window.clearAccountForm = clearAccountForm;
window.clearAllPosts = clearAllPosts;