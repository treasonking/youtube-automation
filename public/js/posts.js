// 게시물 관련 함수들
// ===================== 모듈 import 및 전역 변수 =====================
import * as Accounts from './accounts.js'; // 계정 관련 모듈
import * as UI from './ui.js'; // UI 관련 모듈
import * as Auth from './auth.js'; // 인증 관련 모듈
import * as Media from './media.js'; // 미디어(이미지/동영상) 관련 모듈
import { API_BASE } from './config.js'; // API 서버 주소 상수
let posts = []; // 게시물 목록
let currentPostIndex = 0; // 자동화 진행 중인 게시물 인덱스
let isAutomationRunning = false; // 자동화 실행 상태
let automationSocket = null; // (예비) 자동화용 소켓
// 이미지/영상 선택 배열은 Media 모듈에서 관리
let editingAccountId = null; // 현재 수정 중인 계정 ID
let editingPostId = null; // 현재 수정 중인 게시물 ID
let editNewImages = []; // 수정용 새 이미지 목록
let editNewVideos = []; // 수정용 새 동영상 목록
let imagePaths = []; // 이미지 경로 목록
let videoPaths = []; // 동영상 경로 목록
let postSearchKeyword = '';
let accountSearchKeyword = '';

// ===================== 게시물 추가 =====================
export async function addPost({ content, accountId }) {
    // 게시물 추가 함수 (폼 제출 시 호출)
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
    const account = window.accounts ? window.accounts.find(acc => acc.id === accountId) : null;
    const images = Media.selectedImages.map(img => ({ url: img.url, name: img.name, type: 'image' }));
    // 업로드된 영상 파일과 선택된 YouTube 영상을 모두 포함
    const videos = [
        ...Media.uploadedVideoUrls.map(v => ({ url: v.url, type: 'uploaded' })),
        ...Media.selectedVideos.map(v => ({ url: v.url, title: v.title, channel: v.channel, thumbnail: v.thumbnail, type: 'youtube' }))
    ];
    console.log('selectedImages', Media.selectedImages);
    console.log('selectedVideos', Media.selectedVideos);
    console.log('uploadedVideoUrls', Media.uploadedVideoUrls);
    const postData = {
        content,
        accountId,
        images,
        videos,
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    const user = (await window.supabase.auth.getUser()).data.user;
    if (!user) {
        UI.showCustomAlert('로그인 후 이용하세요.');
        return;
    }
    const user_id = user.id;
    const { error } = await window.supabase
      .from('posts')
      .insert([{ ...postData, user_id, createdAt: new Date().toISOString() }]);
    if (!error) {
        UI.showCustomAlert('게시물이 추가되었습니다.', () => {
        document.getElementById('newPostContent').focus();
    });
      await loadAllAndUpdatePosts();
      resetNewPostForm();
    } else {
      UI.showCustomAlert('게시물 추가 실패: ' + error.message);
    }
}

// ===================== 게시물 수정 =====================
export async function updatePost(postId) {
    // 게시물 수정 함수 (수정 폼 제출 시 호출)
    if (!content) {
        UI.showCustomAlert('게시물 내용을 입력하세요.');
        return;
    }
    if (!accountId) {
        UI.showCustomAlert('계정을 선택하세요.');
        return;
    }
    const { error } = await window.supabase
        .from('posts')
        .update({ content, accountId })
        .eq('id', postId);
    if (!error) {
        UI.showCustomAlert('게시물이 수정되었습니다.');
        await loadAllAndUpdatePosts();
        cancelEditPost();
    } else {
        UI.showCustomAlert('게시물 수정 실패: ' + error.message);
    }
}

// ===================== 게시물 삭제 =====================
export async function deletePost(postId) {
    // 게시물 삭제 함수 (삭제 버튼 클릭 시 호출)
    if (!confirm('이 게시물을 삭제하시겠습니까?')) return;
    const { error } = await window.supabase
      .from('posts')
      .delete()
      .eq('id', postId);
    if (!error) {
      UI.showCustomAlert('게시물이 삭제되었습니다.');
      await loadAllAndUpdatePosts();
    } else {
      UI.showCustomAlert('게시물 삭제 실패: ' + error.message);
    }
}

// ===================== 게시물 목록 불러오기 =====================
export async function loadPosts() {
    // 게시물 목록을 Supabase에서 불러와 posts 배열에 저장
    try {
        const user = (await window.supabase.auth.getUser()).data.user;
        console.log("user", user);
        if (!user) {
            document.getElementById('authModal').style.display = 'flex';
            document.getElementById('mainUI').style.display = 'none';
            return;
        }
        const user_id = user.id;
        const { data, error } = await window.supabase
            .from('posts')
            .select('*')
            .eq('user_id', user_id)
            .order('createdAt', { ascending: true });
        if (error) throw error;
        posts = data || [];
        updatePostList();
        if (posts.length > 0) {
            showStatus('info', `저장된 게시물 ${posts.length}개를 불러왔습니다! 💾`);
        }
    } catch (error) {
        console.error('게시물 불러오기 실패:', error);
        posts = [];
        UI.showCustomAlert('게시물 불러오기 실패:', error);
    }
}

// ===================== 게시물 목록 UI 갱신 =====================
export function updatePostList() {
    // 게시물 목록을 화면에 렌더링
    const postList = document.getElementById('postList');
    const postCount = document.getElementById('postCount');
    
    // 💾 게시물 개수 업데이트
    const completedCount = posts.filter(p => p.status === 'completed').length;
    const failedCount = posts.filter(p => p.status === 'failed').length;
    const pendingCount = posts.filter(p => p.status === 'pending').length;
    
    postCount.innerHTML = `💾 저장된 게시물: ${posts.length}개 
        ${completedCount > 0 ? `(✅${completedCount}` : ''}
        ${failedCount > 0 ? ` ❌${failedCount}` : ''}
        ${pendingCount > 0 ? ` ⏳${pendingCount}` : ''}
        ${completedCount > 0 || failedCount > 0 || pendingCount > 0 ? ')' : ''}`;
    
    if (posts.length === 0) {
        postList.innerHTML = `
            <p style="text-align: center; color: #666; font-style: italic;">
                아직 등록된 게시물이 없습니다.<br>
                위에서 게시물을 추가해보세요!
            </p>
        `;
        return;
    }
    
    postList.innerHTML = posts.map((post, index) => {
        const imageCount = post.images ? post.images.length : 0;
        const videoCount = post.videos ? post.videos.length : 0;
        const mediaInfo = [];
        
        const accountObj = window.accounts ? window.accounts.find(acc => acc.id == post.accountId) : null;
        
        if (imageCount > 0) mediaInfo.push(`📸 ${imageCount}개`);
        if (videoCount > 0) mediaInfo.push(`🎬 ${videoCount}개`);
        
        return `
        <div class="post-item">
            <div class="post-content">
                <h4>게시물 ${index + 1} ${mediaInfo.length > 0 ? `(${mediaInfo.join(', ')})` : ''}</h4>
                <p>${post.content.substring(0, 100)}${post.content.length > 100 ? '...' : ''}</p>
                <small>상태: ${getStatusText(post.status)}</small>
                ${accountObj ? `<div style="margin-top: 4px; color: #28a745; font-size: 12px;">👤 계정: ${accountObj.name} (${accountObj.username})</div>` : ''}
                ${mediaInfo.length > 0 ? `<div style="margin-top: 8px; color: #667eea; font-size: 12px;">📎 미디어: ${mediaInfo.join(', ')}</div>` : ''}
            </div>
            <div class="post-actions">
                ${post.status === 'pending' || post.status === 'failed' ? 
                    `<button class="btn btn-secondary" onclick="editPost('${post.id}')">수정</button>` : 
                    `<button class="btn btn-secondary" disabled title="완료 또는 처리중인 게시물은 수정할 수 없습니다">수정</button>`
                }
                <button class="btn btn-danger" onclick="deletePost('${post.id}')">삭제</button>
            </div>
        </div>
        `;
    }).join('');
}

// ===================== 게시물 수정 모달 열기/닫기 =====================
export function editPost(postId) {
    // 게시물 수정 버튼 클릭 시 호출
    const post = posts.find(p => p.id === postId);
    if (!post) {
        UI.showCustomAlert('게시물을 찾을 수 없습니다.');
        return;
    }
    if (post.status === 'completed' || post.status === 'processing') {
        UI.showCustomAlert('완료되었거나 처리중인 게시물은 수정할 수 없습니다.');
        return;
    }
    openEditPostModal(post);
}
// 게시물 수정 모달 열기
export function openEditPostModal(post) {
    console.log(document.getElementById('editPostContent'))
    editingPostId = post.id; // ← 이 줄이 반드시 필요!
    // 계정 드롭다운 업데이트
    Accounts.updateEditAccountDropdown();
    
    // 기존 데이터 설정
    document.getElementById('editPostContent').value = post.content;
    
    // 계정 선택
    if (post.account) {
        document.getElementById('editPostAccount').value = post.account.id;
    }
    
    // 기존 이미지 표시
    Media.displayEditExistingImages(post.images || []);
    
    // 기존 동영상 표시
    Media.displayEditExistingVideos(post.videos || []);
    
    // 새로 추가할 미디어 초기화
    editNewImages = [];
    editNewVideos = [];
    Media.updateEditNewImages();
    Media.updateEditNewVideos();
    
    // 모달 표시
    document.getElementById('editPostModal').style.display = 'flex';
}

// 게시물 수정 모달 닫기
export function closeEditPostModal() {
    document.getElementById('editPostModal').style.display = 'none';
    editingPostId = null;
    editNewImages = [];
    editNewVideos = [];
    
    // 폼 초기화
    document.getElementById('editPostForm').reset();
    document.getElementById('editExistingImages').innerHTML = '';
    document.getElementById('editExistingVideos').innerHTML = '';
    document.getElementById('editNewImages').innerHTML = '';
    document.getElementById('editNewVideos').innerHTML = '';
    document.getElementById('editVideoResults').innerHTML = '';
}

// ===================== 게시물 수정 저장 =====================
export async function saveEditedPost() {
    // 게시물 수정 모달에서 저장 버튼 클릭 시 호출
    console.log('editingPostId:', editingPostId);
    console.log('posts:', posts.map(p => p.id));
    const content = document.getElementById('editPostContent').value.trim();
    const selectedAccountId = document.getElementById('editPostAccount').value;
    if (!content) {
        UI.showCustomAlert('게시물 내용을 입력해주세요.', () => {
            document.getElementById('editPostContent').focus();
        });
        return;
    }
    if (!selectedAccountId) {
        UI.showCustomAlert('사용할 계정을 선택해주세요.', () => {
            document.getElementById('postAccount').focus();
        });
        return;
    }
    const selectedAccount = window.accounts ? window.accounts.find(acc => acc.id === selectedAccountId) : null;
    if (!selectedAccount) {
        UI.showCustomAlert('선택된 계정을 찾을 수 없습니다.');
        return;
    }
    const post = posts.find(p => p.id === editingPostId);
    if (!post) {
        UI.showCustomAlert('수정할 게시물을 찾을 수 없습니다.');
        return;
    }
    // 상태 체크 추가
    if (post.status === 'completed' || post.status === 'processing') {
        UI.showCustomAlert('완료되었거나 처리중인 게시물은 수정할 수 없습니다.');
        closeEditPostModal();
        return;
    }
    // 기존+새 이미지/동영상 합치기
    let images = (post.images || []).concat(editNewImages);
    let videos = (post.videos || []).concat(editNewVideos);
    // 서버에 PUT 요청
    const { error } = await window.supabase
      .from('posts')
      .update({
        content,
        accountId: selectedAccountId,
        images,
        videos
      })
      .eq('id', editingPostId);
    if (!error) {
      UI.showCustomAlert('게시물이 수정되었습니다.');
      await loadAllAndUpdatePosts();
      closeEditPostModal();
    } else {
      UI.showCustomAlert('게시물 수정 실패: ' + error.message);
    }
}

// ===================== 게시물 가져오기/내보내기 =====================
export function importPosts() {
    // 게시물 JSON 파일 가져오기
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedPosts = JSON.parse(e.target.result);
                
                if (Array.isArray(importedPosts)) {
                    if (posts.length > 0) {
                        if (confirm('기존 게시물이 있습니다. 덮어쓰시겠습니까?')) {
                            posts = importedPosts;
                        } else {
                            posts = posts.concat(importedPosts);
                        }
                    } else {
                        posts = importedPosts;
                    }
                    
                    savePosts();
                    updatePostList();
                    showStatus('success', `${importedPosts.length}개 게시물을 가져왔습니다! 💾`);
                } else {
                    UI.showCustomAlert('올바른 게시물 파일이 아닙니다.');
                }
            } catch (error) {
                UI.showCustomAlert('파일을 읽는 중 오류가 발생했습니다.');
                console.error('Import error:', error);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ===================== 게시물 필터/정렬 =====================
export function getFilteredSortedPosts() {
    // posts 배열을 필터링/정렬하여 반환
    if (!Array.isArray(posts)) return [];
    let filtered = posts.slice();
    if (typeof postFilter !== 'undefined') {
        if (postFilter.status) filtered = filtered.filter(p => p.status === postFilter.status);
        if (postFilter.dateStart) filtered = filtered.filter(p => p.createdAt && p.createdAt >= postFilter.dateStart);
        if (postFilter.dateEnd) filtered = filtered.filter(p => p.createdAt && p.createdAt <= postFilter.dateEnd + 'T23:59:59');
        if (postFilter.search) filtered = filtered.filter(p => p.content && p.content.includes(postFilter.search));
        filtered.sort((a, b) => {
            if (postFilter.sort === 'desc') return (b.createdAt || '').localeCompare(a.createdAt || '');
            else return (a.createdAt || '').localeCompare(b.createdAt || '');
        });
    }
    return filtered;
}

// ===================== 게시물/계정 전체 새로고침 =====================
export async function loadAllAndUpdatePosts() {
    await Accounts.loadAccounts();
    await loadPosts();
    updatePostList();
}

// ===================== 게시물 로컬 저장 =====================
export function savePosts() {
    localStorage.setItem('posts', JSON.stringify(posts));
}

// ===================== 게시물 상태 PATCH =====================
export async function patchPostStatus(postId, status) {
    try {
        const { error } = await window.supabase
            .from('posts')
            .update({ status })
            .eq('id', postId);
        return { success: !error };
    } catch (error) {
        console.error('게시물 상태 PATCH 실패:', error);
        return { success: false };
    }
}

// ===================== 상태 텍스트 변환 =====================
export function getStatusText(status) {
    const statusMap = {
        'pending': '대기 중',
        'processing': '처리 중',
        'completed': '완료',
        'failed': '실패'
    };
    return statusMap[status] || status;
}

// ===================== 상태 메시지/알림 표시 =====================
function showStatus(type, message) {
    const status = document.getElementById('automationStatus');
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    setTimeout(() => {
        status.style.display = 'none';
    }, 5000);
}
// 기타 게시물 관련 함수들 export 

// === 자동화 관련 함수들 추가 ===
// ===================== 자동화 시작 =====================
export function startAutomation() {
    // 자동화 시작 버튼 클릭 시 호출
    if (posts.length === 0) {
        UI.showCustomAlert('먼저 게시물을 추가해주세요.');
        return;
    }
    const pendingPosts = posts.filter(post => post.status !== 'completed');
    if (pendingPosts.length === 0) {
        UI.showCustomAlert('처리할 게시물이 없습니다.\n모든 게시물이 이미 완료되었습니다.');
        return;
    }
    // 계정 매핑
    pendingPosts.forEach(post => {
        post.account = window.accounts ? window.accounts.find(acc => acc.id == post.accountId) || null : null;
    });
    const postsWithoutAccount = pendingPosts.filter(post => !post.account);
    if (postsWithoutAccount.length > 0) {
        UI.showCustomAlert(`${postsWithoutAccount.length}개의 게시물에 계정이 설정되지 않았습니다.\n계정 관리 탭에서 계정을 추가하고 게시물에 계정을 설정해주세요.`);
        UI.switchTab('accounts');
        return;
    }
    const completedCount = posts.filter(post => post.status === 'completed').length;
    if (completedCount > 0) {
        UI.addLog(`📋 총 ${posts.length}개 게시물 중 ${completedCount}개는 이미 완료되어 건너뜁니다.`);
        UI.addLog(`🎯 ${pendingPosts.length}개 게시물을 처리합니다.`);
    }
    isAutomationRunning = true;
    currentPostIndex = 0;
    const startBtn = document.getElementById('startAutomation');
    const stopBtn = document.getElementById('stopAutomation');
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    showStatus('info', '자동화를 시작합니다...');
    UI.addLog('🚀 자동화 시작');
    processNextPost();
}

// ===================== 다음 게시물 처리 =====================
export async function processNextPost() {
    if (!isAutomationRunning) {
        completeAutomation();
        return;
    }
    
    // 완료되지 않은 다음 게시물 찾기
    while (currentPostIndex < posts.length) {
        const post = posts[currentPostIndex];
        
        // 이미 완료된 게시물은 건너뛰기
        if (post.status === 'completed') {
            addLog(`✅ 게시물 ${currentPostIndex + 1}은 이미 완료되어 건너뜁니다.`);
            currentPostIndex++;
            continue;
        }
        
        // 처리할 게시물 발견
        post.status = 'processing';
        updatePostList();
        break;
    }
    
    // 모든 게시물 처리 완료
    if (currentPostIndex >= posts.length) {
        completeAutomation();
        return;
    }
    
    const post = posts[currentPostIndex];
    
    // 실제 처리할 게시물 개수 기준으로 진행률 계산
    const totalPendingPosts = posts.filter(p => p.status !== 'completed').length;
    const processedPosts = posts.slice(0, currentPostIndex + 1).filter(p => p.status === 'processing' || p.status === 'completed').length;
    const progress = (processedPosts / Math.max(totalPendingPosts, 1)) * 100;
    
    UI.updateProgress(progress, `게시물 ${currentPostIndex + 1}/${posts.length} 처리 중... (처리 대상: ${totalPendingPosts}개)`);
    
    addLog(`📝 게시물 ${currentPostIndex + 1} 처리 시작`);
    
    // 실제 자동화 실행 (📸🎬 미디어 포함)
    let settings = {};
    try {
        const res = await fetch(`${API_BASE}/settings`);
        const data = await res.json();
        if (data.success && data.settings) {
            settings = data.settings;
        }
    } catch (e) {
        addLog('⚠️ 설정 불러오기 실패, 기본값 사용');
    }
    const imageCount = post.images ? post.images.length : 0;
    const videoCount = post.videos ? post.videos.length : 0;
    
    addLog(`📸 이미지 ${imageCount}개, 🎬 동영상 ${videoCount}개 포함`);
    addLog(`🚀 실제 자동화 시작 - Python 스크립트 실행 중...`);
    
    // 실제 자동화 API 호출 (단일 게시물 API 사용)
    // 계정 정보는 항상 accounts 배열에서 가져오도록 수정
    let account = post.account;
    if (!account && post.accountId) {
        account = accounts.find(acc => acc.id == post.accountId) || null;
    }
    if (!account) {
        addLog('❌ 계정 정보를 찾을 수 없습니다. 게시물 ' + (currentPostIndex + 1) + ' 건너뜀');
        post.status = 'failed';
        await patchPostStatus(post.id, 'failed');
        savePosts();
        updatePostList();
        currentPostIndex++;
        setTimeout(() => {
            if (isAutomationRunning) {
                processNextPost();
            }
        }, 2000);
        return;
    }
    // 이미지 파일을 Base64로 변환하여 전송
    const imageBase64s = [];
    for (const img of (post.images || [])) {
        if (img.url && img.url.includes('/temp/')) {
            try {
                // 서버에서 이미지 파일을 가져와서 Base64로 변환
                const response = await fetch(img.url);
                const blob = await response.blob();
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                imageBase64s.push(base64);
                console.log(`✅ 이미지 Base64 변환 완료: ${img.url}`);
            } catch (error) {
                console.error(`❌ 이미지 Base64 변환 실패: ${img.url}`, error);
            }
        }
    }
    
    // 비디오 경로 추출
    const videoPaths = (post.videos || []).map(video => {
        if (video.url && video.url.includes('/temp/')) {
            // /temp/ 경로를 상대 경로로 변환
            return video.url.replace('http://127.0.0.1:3000/temp/', 'temp/');
        }
        return video.url;
    }).filter(Boolean);
    
    console.log('📸 이미지 경로:', imagePaths);
    console.log('🎬 비디오 경로:', videoPaths);
    
    const automationData = {
        username: account.username,
        password: account.password,
        postContent: post.content,
        images: imageBase64s, // Base64 이미지 데이터
        videos: videoPaths,
        settings: settings,
        postIndex: currentPostIndex,
        // 계정 정보 추가 (다중 계정 지원)
        accountUsername: account.username,
        accountPassword: account.password
    };

    // 🔧 데이터 정리 함수 - 직렬화 불가능한 객체를 안전한 형태로 변환
    function sanitizeAutomationData(data) {
        const result = { ...data };
        
        // 이미지 데이터 정리 (이제 문자열 경로)
        if (result.images && Array.isArray(result.images)) {
            result.images = result.images.map((img, idx) => {
                console.log(`🔧 이미지 ${idx} 정리 중:`, typeof img, img?.constructor?.name);
                
                if (typeof img === 'string') {
                    return img; // 문자열 경로는 그대로 유지
                } else if (img instanceof File || img instanceof Blob) {
                    console.warn(`⚠️ File/Blob 객체 발견 - 제거됨`);
                    return null;
                } else {
                    console.warn(`⚠️ 예상치 못한 이미지 타입: ${typeof img} - 제거됨`);
                    return null;
                }
            }).filter(img => img !== null);
        }
        
        // 동영상 데이터 정리 (이제 문자열 경로)
        if (result.videos && Array.isArray(result.videos)) {
            result.videos = result.videos.map(vid => {
                if (typeof vid === 'string') {
                    return vid; // 문자열 경로는 그대로 유지
                } else if (vid instanceof File || vid instanceof Blob) {
                    console.warn(`⚠️ 동영상에 File/Blob 객체 발견 - 제거됨`);
                    return null;
                } else {
                    console.warn(`⚠️ 예상치 못한 동영상 타입: ${typeof vid} - 제거됨`);
                    return null;
                }
            }).filter(vid => vid !== null);
        }
        
        // 최종 직렬화 테스트
        try {
            JSON.stringify(result);
            console.log('✅ 데이터 정리 완료 - 직렬화 가능');
        } catch (e) {
            console.error('❌ 데이터 정리 후에도 직렬화 불가능:', e);
        }
        
        return result;
    }

    // 🔍 디버깅: 데이터 타입 및 직렬화 검사
    console.log('🚀 자동화 데이터 전송 - 디버깅 시작');
    console.log('📊 데이터 타입 검사:');
    console.log('- username type:', typeof automationData.username, 'value:', automationData.username);
    console.log('- password type:', typeof automationData.password, 'length:', automationData.password?.length);
    console.log('- postContent type:', typeof automationData.postContent, 'length:', automationData.postContent?.length);
    console.log('- images type:', typeof automationData.images, 'length:', automationData.images?.length);
    console.log('- videos type:', typeof automationData.videos, 'length:', automationData.videos?.length);
    console.log('- settings type:', typeof automationData.settings, 'value:', automationData.settings);
    console.log('- postIndex type:', typeof automationData.postIndex, 'value:', automationData.postIndex);
    
    // 이미지 데이터 상세 검사
    if (automationData.images && automationData.images.length > 0) {
        console.log('📸 이미지 데이터 상세:');
        automationData.images.forEach((img, idx) => {
            console.log(`  이미지 ${idx}:`, {
                type: typeof img,
                path: img,
                isFile: img instanceof File,
                isBlob: img instanceof Blob
            });
        });
    }
    
    // 동영상 데이터 상세 검사
    if (automationData.videos && automationData.videos.length > 0) {
        console.log('🎬 동영상 데이터 상세:');
        automationData.videos.forEach((vid, idx) => {
            console.log(`  동영상 ${idx}:`, {
                type: typeof vid,
                path: vid,
                isFile: vid instanceof File,
                isBlob: vid instanceof Blob
            });
        });
    }
    
    // JSON 직렬화 테스트
    try {
        const testSerialization = JSON.stringify(automationData);
        console.log('✅ JSON 직렬화 성공, 크기:', testSerialization.length);
    } catch (serError) {
        console.error('❌ JSON 직렬화 실패:', serError);
        console.log('🔍 직렬화 실패 원인 분석...');
        
        // 각 속성별로 직렬화 테스트
        Object.keys(automationData).forEach(key => {
            try {
                JSON.stringify(automationData[key]);
                console.log(`✅ ${key}: 직렬화 가능`);
            } catch (err) {
                console.error(`❌ ${key}: 직렬화 불가능`, err);
            }
        });
    }
    
    // Electron의 ipcRenderer를 통해 메인 프로세스에 요청
    try {
        const data = await window.electronAPI.runAutomation(automationData);
        if (data.success) {
            post.status = 'completed';
            await patchPostStatus(post.id, 'completed');
            addLog(`✅ 게시물 ${currentPostIndex + 1} 완료`);
        } else {
            post.status = 'failed';
            await patchPostStatus(post.id, 'failed');
            addLog(`❌ 게시물 ${currentPostIndex + 1} 실패: ${data.error}`);
        }
        // 💾 상태 변경 후 자동 저장
        savePosts();
        updatePostList();
        currentPostIndex++;
        // 다음 게시물로 이동 (딜레이 후)
        const delay = parseInt(document.getElementById('postDelay').value) * 1000;
        setTimeout(() => {
            if (isAutomationRunning) {
                processNextPost();
            }
        }, delay);
    } catch (error) {
        console.error('🔍 [FRONTEND] 자동화 오류 상세:', error);
        console.error('🔍 [FRONTEND] 오류 타입:', typeof error);
        console.error('🔍 [FRONTEND] 오류 이름:', error.name);
        console.error('🔍 [FRONTEND] 오류 메시지:', error.message);
        console.error('🔍 [FRONTEND] 오류 스택:', error.stack);
        post.status = 'failed';
        addLog(`❌ 게시물 ${currentPostIndex + 1} 오류: ${error.message}`);
        // 💾 상태 변경 후 자동 저장
        savePosts();
        updatePostList();
        currentPostIndex++;
        setTimeout(() => {
            if (isAutomationRunning) {
                processNextPost();
            }
        }, 2000);
    }
}

// ===================== 자동화 완료 처리 =====================
function completeAutomation() {
    isAutomationRunning = false;
    const startBtn = document.getElementById('startAutomation');
    const stopBtn = document.getElementById('stopAutomation');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    const completedCount = posts.filter(p => p.status === 'completed').length;
    const failedCount = posts.filter(p => p.status === 'failed').length;
    UI.updateProgress(100, `완료: ${completedCount}개, 실패: ${failedCount}개`);
    showStatus('success', `자동화 완료! 성공: ${completedCount}개, 실패: ${failedCount}개`);
    UI.addLog(`🎉 자동화 완료 - 성공: ${completedCount}개, 실패: ${failedCount}개`);
}

// ===================== 자동화 중지 =====================
export function stopAutomation() {
    isAutomationRunning = false;
    const startBtn = document.getElementById('startAutomation');
    const stopBtn = document.getElementById('stopAutomation');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    showStatus('info', '자동화가 중지되었습니다.');
    UI.addLog('⏹️ 자동화 중지됨');
}

// ===================== 자동화 상태 초기화 =====================
export function resetAutomation() {
    const completedCount = posts.filter(post => post.status === 'completed').length;
    if (completedCount > 0) {
        const resetAll = confirm(`완료된 게시물이 ${completedCount}개 있습니다.\n\n"확인": 모든 게시물을 대기 상태로 초기화\n"취소": 완료된 게시물은 유지하고 실패/처리중인 게시물만 초기화`);
        if (resetAll) {
            posts.forEach(post => post.status = 'pending');
            UI.addLog('🔄 모든 게시물이 대기 상태로 초기화되었습니다.');
        } else {
            posts.forEach(post => { if (post.status !== 'completed') post.status = 'pending'; });
            UI.addLog(`🔄 완료된 ${completedCount}개 게시물은 유지하고 나머지만 초기화되었습니다.`);
        }
    } else {
        posts.forEach(post => post.status = 'pending');
        UI.addLog('🔄 모든 게시물이 대기 상태로 초기화되었습니다.');
    }
    currentPostIndex = 0;
    savePosts();
    updatePostList();
    UI.updateProgress(0, '자동화 준비 완료');
    UI.clearLogs();
    showStatus('info', '자동화가 초기화되고 저장되었습니다! 💾');
}

// ===================== 전역 바인딩 (HTML에서 직접 호출 가능하도록) =====================
window.startAutomation = startAutomation;
window.stopAutomation = stopAutomation;
window.resetAutomation = resetAutomation;
window.deletePost = deletePost;
window.editPost = editPost;
// === 자동화 관련 함수들 추가 끝 === 

// ===================== 새 게시물 폼 초기화 =====================
function resetNewPostForm(){
  document.getElementById('newPostContent').value='';
  document.getElementById('postAccount').selectedIndex=0;
  Media.selectedImages.length = 0;
  Media.selectedVideos.length = 0; 
  Media.uploadedVideoUrls.length = 0;
  Media.updateSelectedImages && Media.updateSelectedImages();
  Media.updateSelectedVideos && Media.updateSelectedVideos();
  document.getElementById('videoSearch').value='';
  document.getElementById('videoResults').innerHTML='';
  document.getElementById('imageUpload').value='';
  document.getElementById('selectedVideoFiles').innerHTML='';
  Media.updateMediaUIState && Media.updateMediaUIState();
} 