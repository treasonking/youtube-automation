// 미디어(이미지/동영상) 관련 함수들
// ===================== 전역 변수 및 상태 =====================
let editNewImages = []; // 수정용 새 이미지 목록
let editNewVideos = []; // 수정용 새 동영상 목록
let editingPostId = null; // 현재 수정 중인 게시물 ID
export let selectedImages = []; // 새 게시물 작성 시 선택된 이미지 목록
export let selectedVideos = []; // 새 게시물 작성 시 선택된 동영상 목록
window.selectedImages = selectedImages; // 전역 바인딩
window.selectedVideos = selectedVideos; // 전역 바인딩
import { API_BASE } from './config.js'; // API 서버 주소 상수
import * as UI from './ui.js'; // UI 관련 함수 import

// ===================== 이미지 업로드 처리 =====================
export async function handleImageUpload(event) {
    // 파일 선택 이벤트 핸들러 (input[type=file])
    const files = Array.from(event.target.files);
    const MAX_IMAGE_SIZE = 16 * 1024 * 1024; // 16MB 제한
    if (files.length === 0) return;
    if (selectedImages.length >= 1) {
        UI.showCustomAlert('이미지는 1장만 첨부할 수 있습니다. 기존 이미지를 삭제 후 다시 선택하세요.');
        event.target.value = '';
        return;
    }
    const file = files[0];
    if (file.size > MAX_IMAGE_SIZE) {
        UI.showCustomAlert('16MB 이상 이미지는 첨부할 수 없습니다. (' + file.name + ')');
        event.target.value = '';
        return;
    }
    if (file.type.startsWith('image/')) {
        // FormData로 이미지 파일 서버에 업로드
        const formData = new FormData();
        formData.append('image', file);
        try {
            const res = await fetch(`${API_BASE}/upload-image`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success && data.url) {
                // 서버에서 반환된 URL을 실제 접근 가능한 경로로 변환
                let url = data.url;
                if (!url.startsWith('http') && !url.startsWith('file://')) {
                    url = url.replace(/\\/g, '/');
                    if (url.startsWith('/')) {
                        // 서버 루트 상대 경로인 경우 http://<host>:3000 앞에 붙여서 접근 가능하도록 변환
                        const host = window.location.hostname || '127.0.0.1';
                        url = `http://${host}:3000${url}`;
                    } else {
                        // 절대 윈도우 경로인 경우 file:///C:/path 로 변환
                        url = 'file:///' + url.replace(/^([A-Za-z]):/, '$1:/');
                    }
                }
                selectedImages = [{ url, name: file.name, type: 'image' }];
                updateSelectedImages();
                updateMediaUIState();
            } else {
                UI.showCustomAlert('이미지 업로드 실패: ' + (data.error || '서버 오류'));
            }
        } catch (err) {
            UI.showCustomAlert('이미지 업로드 중 오류 발생 : ' + err);
        }
    }
    event.target.value = '';
}

// ===================== 동영상 업로드 처리 =====================
export let uploadedVideoUrls = []; // 업로드된 동영상 URL 목록
window.uploadedVideoUrls = uploadedVideoUrls; // 전역 바인딩
export function handleVideoFileUpload(event) {
    // 동영상 파일 업로드 input 이벤트 핸들러
    const files = event.target.files;
    if (uploadedVideoUrls.length + selectedVideos.length + files.length > 1) {
        UI.showCustomAlert('영상은 1개만 첨부할 수 있습니다.');
        event.target.value = '';
        return;
    }
    const container = document.getElementById('selectedVideoFiles');
    container.innerHTML = '';
    uploadedVideoUrls = [];
    if (files.length > 0) {
        for (const file of files) {
            const div = document.createElement('div');
            div.textContent = `🎬 ${file.name}`;
            // 제거 버튼 추가
            const btn = document.createElement('button');
            btn.textContent = '×';
            btn.className = 'remove-btn';
            btn.onclick = function() { removeUploadedVideo(); };
            div.appendChild(btn);
            container.appendChild(div);
            uploadVideoFile(file); // 실제 업로드 함수 호출
        }
    }
    updateMediaUIState();
}

// ===================== 이미지/동영상 UI 갱신 =====================
export function updateSelectedImages() {
    // 선택된 이미지 UI 갱신
    const container = document.getElementById('selectedImages');
    if (selectedImages.length === 0) {
        container.innerHTML = '';
    } else {
        const img = selectedImages[0];
        container.innerHTML = `
            <div class="media-item">
                <img src="${img.url}" alt="${img.name}">
                <button class="remove-btn" onclick="removeImage('${img.url}')">×</button>
            </div>
        `;
    }
    updateMediaUIState();
}

export function updateSelectedVideos() {
    // 선택된 동영상 UI 갱신
    const container = document.getElementById('selectedVideos');
    if (selectedVideos.length === 0) {
        container.innerHTML = '';
    } else {
        container.innerHTML = selectedVideos.map(video => `
            <div class="video-item">
                <img src="${video.thumbnail}" alt="${video.title}">
                <div class="video-item-info">
                    <div class="video-item-title">${video.title}</div>
                    <div class="video-item-channel">${video.channel}</div>
                </div>
                <button class="remove-btn" onclick="removeVideo('${video.id}')">×</button>
            </div>
        `).join('');
    }
    updateMediaUIState();
}

// ===================== 수정 모드: 기존 이미지/동영상 삭제 =====================
export function removeEditExistingImage(index) {
    // 수정 모달에서 기존 이미지 삭제
    const post = posts.find(p => p.id === editingPostId);
    if (post && post.images) {
        post.images.splice(index, 1);
        displayEditExistingImages(post.images);
    }
}

// 기존 동영상 삭제
export function removeEditExistingVideo(index) {
    const post = posts.find(p => p.id === editingPostId);
    if (post && post.videos) {
        post.videos.splice(index, 1);
        displayEditExistingVideos(post.videos);
    }
}

// ===================== 수정 모드: 새 이미지 업로드/제거 =====================
export function handleEditImageUpload(event) {
    // 수정 모달에서 새 이미지 업로드
    const files = Array.from(event.target.files);
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const imageData = {
                    id: Date.now() + Math.random(),
                    name: file.name,
                    type: 'image',
                    data: e.target.result,
                    file: file
                };
                editNewImages.push(imageData);
                updateEditNewImages();
            };
            reader.readAsDataURL(file);
        }
    });
}

// 수정용 새 이미지 표시 업데이트
export function updateEditNewImages() {
    const container = document.getElementById('editNewImages');
    if (editNewImages.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = editNewImages.map(img => `
        <div class="media-item">
            <img src="${img.data}" alt="${img.name}">
            <div class="media-item-info">
                <div class="media-item-title">${img.name}</div>
            </div>
            <button class="remove-btn" onclick="removeEditNewImage('${img.id}')">×</button>
        </div>
    `).join('');
}

// 수정용 새 이미지 제거
export function removeEditNewImage(imageId) {
    editNewImages = editNewImages.filter(img => img.id !== imageId);
    updateEditNewImages();
}

// ===================== 수정 모드: 동영상 검색/선택/제거 =====================
export async function searchEditVideos() {
    // 수정 모달에서 동영상 검색
    const query = document.getElementById('editVideoSearch').value.trim();
    if (!query) {
        UI.showCustomAlert('검색어를 입력해주세요.');
        return;
    }
    const resultsContainer = document.getElementById('editVideoResults');
    resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px;">🔍 검색 중...</div>';
    try {
        // 서버 API로 실제 검색
        const res = await fetch(`${API_BASE}/search-videos?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.videos)) {
            displayEditVideoResults(data.videos);
        } else {
            resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff4757;">❌ 검색 결과가 없습니다.</div>';
        }
    } catch (error) {
        resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff4757;">❌ 검색 중 오류가 발생했습니다.</div>';
        console.error('Video search error:', error);
    }
}

// 수정용 동영상 검색 결과 표시
export function displayEditVideoResults(videos) {
    const container = document.getElementById('editVideoResults');
    if (videos.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">검색 결과가 없습니다.</div>';
        return;
    }
    container.innerHTML = videos.map(video => `
        <div class="video-result-item" onclick="selectEditVideo('${video.id}', '${video.title}', '${video.channel}', '${video.thumbnail}')">
            <img src="${video.thumbnail}" alt="${video.title}">
            <div class="video-result-info">
                <div class="video-result-title">${video.title}</div>
                <div class="video-result-channel">${video.channel}</div>
            </div>
        </div>
    `).join('');
}

// 수정용 동영상 선택
export function selectEditVideo(videoId, title, channel, thumbnail) {
    const videoData = {
        id: videoId,
        title: title,
        channel: channel,
        thumbnail: thumbnail,
        url: `https://www.youtube.com/watch?v=${videoId}`
    };
    // 중복 선택 방지
    if (!editNewVideos.find(v => v.id === videoId)) {
        editNewVideos.push(videoData);
        updateEditNewVideos();
        // 검색 결과 숨기기
        document.getElementById('editVideoResults').innerHTML = '';
        document.getElementById('editVideoSearch').value = '';
    }
}

// 수정용 새 동영상 표시 업데이트
export function updateEditNewVideos() {
    const container = document.getElementById('editNewVideos');
    if (editNewVideos.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = editNewVideos.map(video => `
        <div class="video-item">
            <img src="${video.thumbnail}" alt="${video.title}">
            <div class="video-item-info">
                <div class="video-item-title">${video.title}</div>
                <div class="video-item-channel">${video.channel}</div>
            </div>
            <button class="remove-btn" onclick="removeEditNewVideo('${video.id}')">×</button>
        </div>
    `).join('');
}

// 수정용 새 동영상 제거
export function removeEditNewVideo(videoId) {
    editNewVideos = editNewVideos.filter(video => video.id !== videoId);
    updateEditNewVideos();
}

// === 추가: 이미지 제거 (작성/추가 단계) ===
export function removeImage(imageUrl){
    // 새 게시물 작성 시 이미지 제거
    selectedImages = selectedImages.filter(img => img.url !== imageUrl);
    updateSelectedImages();
    updateMediaUIState();
}

// === 전역 바인딩: HTML에서 직접 호출하도록 ===
window.handleImageUpload = handleImageUpload;
window.removeImage = removeImage;
window.handleVideoFileUpload = handleVideoFileUpload;
window.searchVideos = searchVideos;
window.uploadVideoFile = uploadVideoFile;
window.selectVideo = selectVideo;
window.removeVideo = removeVideo;
window.displayEditExistingVideos = displayEditExistingVideos;
window.updateUploadedVideoUI = updateUploadedVideoUI;
window.updateMediaUIState = updateMediaUIState;
window.removeUploadedVideo = removeUploadedVideo;
window.displayEditExistingImages = displayEditExistingImages;

// ===================== 동영상 파일 업로드 =====================
export async function uploadVideoFile(file) {
    // 동영상 파일을 서버에 업로드하고 URL을 받아옴
    const formData = new FormData();
    formData.append('video', file);
    try {
        const res = await fetch(`${API_BASE}/upload-video`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.url) {
            uploadedVideoUrls.push({ url: data.url });
            updateUploadedVideoUI();
            updateMediaUIState();
        } else {
            UI.showCustomAlert('업로드 실패');
        }
    } catch (e) {
        UI.showCustomAlert('업로드 중 오류 발생: ' + e.message);
    }
}

// ===================== 동영상 검색/선택/제거 =====================
export async function searchVideos() {
    // 동영상 검색 API 호출
    const query = document.getElementById('videoSearch').value.trim();
    if (!query) {
        UI.showCustomAlert('검색어를 입력해주세요.');
        return;
    }
    const resultsContainer = document.getElementById('videoResults');
    resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px;">🔍 검색 중...</div>';
    try {
        // 서버 API로 실제 검색
        const res = await fetch(`${API_BASE}/search-videos?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.videos)) {
            displayVideoResults(data.videos);
        } else {
            resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff4757;">❌ 검색 결과가 없습니다.</div>';
        }
    } catch (error) {
        resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff4757;">❌ 검색 중 오류가 발생했습니다.</div>';
        console.error('Video search error:', error);
    }
}

// 🎬 동영상 검색 결과 표시
export function displayVideoResults(videos) {
    const container = document.getElementById('videoResults');
    if (videos.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">검색 결과가 없습니다.</div>';
        return;
    }
    container.innerHTML = videos.map(video => `
        <div class="video-result-item" onclick="selectVideo('${video.id}', '${video.title}', '${video.channel}', '${video.thumbnail}')">
            <img src="${video.thumbnail}" alt="${video.title}">
            <div class="video-result-info">
                <div class="video-result-title">${video.title}</div>
                <div class="video-result-channel">${video.channel}</div>
            </div>
        </div>
    `).join('');
}

// 🎬 동영상 선택
export function selectVideo(videoId, title, channel, thumbnail) {
    if (uploadedVideoUrls.length > 0 || selectedVideos.length >= 1) {
        UI.showCustomAlert('영상은 1개만 첨부할 수 있습니다.');
        return;
    }
    const videoData = {
        id: videoId,
        title: title,
        channel: channel,
        thumbnail: thumbnail,
        url: `https://www.youtube.com/watch?v=${videoId}`
    };
    if (!selectedVideos.find(v => v.id === videoId)) {
        selectedVideos.push(videoData);
        updateSelectedVideos();
        document.getElementById('videoResults').innerHTML = '';
        document.getElementById('videoSearch').value = '';
    }
    updateMediaUIState();
}
export function removeVideo(videoId) {
    // 선택된 동영상 제거
    selectedVideos = selectedVideos.filter(video => video.id !== videoId);
    updateSelectedVideos();
    updateMediaUIState();
}
export function displayEditExistingVideos(videos) {
    // 수정 모달에서 기존 동영상 표시
    const container = document.getElementById('editExistingVideos');
    if (videos.length === 0) {
        container.innerHTML = '<p style="color: #666; font-style: italic;">등록된 동영상이 없습니다.</p>';
        return;
    }
    container.innerHTML = videos.map((video, index) => `
        <div class="video-item">
            <img src="${video.thumbnail}" alt="${video.title}">
            <div class="video-item-info">
                <div class="video-item-title">${video.title}</div>
                <div class="video-item-channel">${video.channel}</div>
            </div>
            <button class="remove-btn" onclick="removeEditExistingVideo(${index})" title="동영상 삭제">×</button>
        </div>
    `).join('');
}
export function updateUploadedVideoUI() {
    // 업로드된 동영상 UI 갱신
    const container = document.getElementById('selectedVideoFiles');
    container.innerHTML = '';
    uploadedVideoUrls.forEach((v, idx) => {
        const div = document.createElement('div');
        div.textContent = `🎬 업로드 완료: ${v.url}`;
        const btn = document.createElement('button');
        btn.textContent = '×';
        btn.className = 'remove-btn';
        btn.onclick = removeUploadedVideo;
        div.appendChild(btn);
        container.appendChild(div);
    });
}
export function updateMediaUIState() {
    // 이미지/동영상 업로드/검색 input의 활성화/비활성화 상태를 동적으로 조정
    const imageInput = document.getElementById('imageUpload');
    const videoFileInput = document.getElementById('videoFileUpload');
    const videoSearchInput = document.getElementById('videoSearch');
    const videoSearchBtn = videoSearchInput?.nextElementSibling;
    // 영상(업로드/검색) 또는 이미지가 하나라도 있으면 나머지 모두 비활성화
    if (selectedImages.length > 0) {
        videoFileInput.disabled = true;
        videoSearchInput.disabled = true;
        if (videoSearchBtn) videoSearchBtn.disabled = true;
    } else if (uploadedVideoUrls.length > 0 || selectedVideos.length > 0) {
        imageInput.disabled = true;
        videoFileInput.disabled = false;
        videoSearchInput.disabled = false;
        if (videoSearchBtn) videoSearchBtn.disabled = false;
        // 단, 영상이 이미 있으면 영상 업로드/검색도 비활성화
        if (uploadedVideoUrls.length > 0 || selectedVideos.length > 0) {
            videoFileInput.disabled = true;
            videoSearchInput.disabled = true;
            if (videoSearchBtn) videoSearchBtn.disabled = true;
        }
    } else {
        imageInput.disabled = false;
        videoFileInput.disabled = false;
        videoSearchInput.disabled = false;
        if (videoSearchBtn) videoSearchBtn.disabled = false;
    }
}
export function removeUploadedVideo() {
    // 업로드된 동영상 제거
    uploadedVideoUrls = [];
    document.getElementById('selectedVideoFiles').innerHTML = '';
    updateMediaUIState();
}
export function displayEditExistingImages(images) {
    // 수정 모달에서 기존 이미지 표시
    const container = document.getElementById('editExistingImages');
    if (images.length === 0) {
        container.innerHTML = '<p style="color: #666; font-style: italic;">등록된 이미지가 없습니다.</p>';
        return;
    }
    container.innerHTML = images.map((img, index) => `
        <div class="media-item">
            <img src="${img.data}" alt="${img.name}">
            <div class="media-item-info">
                <div class="media-item-title">${img.name}</div>
            </div>
            <button class="remove-btn" onclick="removeEditExistingImage(${index})" title="이미지 삭제">×</button>
        </div>
    `).join('');
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
    const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);
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
// 기타 미디어 관련 함수들 export 
