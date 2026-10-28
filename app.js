import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// TODO: SDK 설정값 복사해서 붙여넣기
const firebaseConfig = {
  apiKey: "AIzaSyBzLHaMqa477tx7lt5ZvxCgTQJQ1cn0SoE",
  authDomain: "online-writing-class.firebaseapp.com",
  projectId: "online-writing-class",
  storageBucket: "online-writing-class.firebasestorage.app",
  messagingSenderId: "156518754690",
  appId: "1:156518754690:web:0f9cd860bf5266d48b079b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM 요소
const loginSection = document.getElementById('loginSection');
const boardSection = document.getElementById('boardSection');
const studentNameInput = document.getElementById('studentName');
const studentLoginBtn = document.getElementById('studentLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const welcomeMessage = document.getElementById('welcomeMessage');

const writeModal = document.getElementById('writeModal');
const modalTitle = writeModal.querySelector('h2'); // 팝업창 제목 요소
const fabWrite = document.getElementById('fabWrite');
const closeModalBtn = document.getElementById('closeModalBtn');
const submitBtn = document.getElementById('submitBtn');
const postContent = document.getElementById('postContent');
const postTitle = document.getElementById('postTitle');
const fontColorInput = document.getElementById('fontColor');
const fontSizeSelect = document.getElementById('fontSize');
const imageUpload = document.getElementById('imageUpload');
const feedSection = document.getElementById('feedSection');

const pastelColors = ['#ffccd5', '#cce0ff', '#d4edda'];
let currentStudentName = sessionStorage.getItem('studentName');
let editingPostId = null; // 수정 중인 게시글 ID를 저장하는 변수 (null이면 새 글 쓰기)

// --- 로그인 로직 ---
function checkLoginStatus() {
  if (currentStudentName) {
    loginSection.style.display = 'none';
    boardSection.style.display = 'block';
    welcomeMessage.innerText = `${currentStudentName} 학생`;
  } else {
    loginSection.style.display = 'block';
    boardSection.style.display = 'none';
  }
}
checkLoginStatus();

studentLoginBtn.addEventListener('click', () => {
  const name = studentNameInput.value.trim();
  if (!name) return alert("이름을 입력해 주세요.");
  currentStudentName = name;
  sessionStorage.setItem('studentName', currentStudentName);
  checkLoginStatus();
});

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('studentName');
  currentStudentName = null;
  studentNameInput.value = "";
  checkLoginStatus();
});

// --- 모달 창 제어 ---
// 새 글 쓰기 버튼(+) 클릭 시
fabWrite.addEventListener('click', () => {
  editingPostId = null;
  modalTitle.innerText = "새 글 쓰기";
  submitBtn.textContent = "게시글 올리기";
  
  postTitle.value = ""; // 제목 초기화 추가
  postContent.value = "";
  fontColorInput.value = "#000000";
  fontSizeSelect.value = "16px";
  imageUpload.value = "";
  
  writeModal.style.display = 'flex';
});

closeModalBtn.addEventListener('click', () => writeModal.style.display = 'none');
window.addEventListener('click', (e) => { if (e.target === writeModal) writeModal.style.display = 'none'; });
window.addEmoji = (emoji) => postContent.value += emoji;

const convertToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

// --- 게시글 업로드 (새 글 작성 및 수정 겸용) ---
submitBtn.addEventListener('click', async () => {
  const title = postTitle.value.trim(); // 제목 값 가져오기
  const content = postContent.value.trim();
  const file = imageUpload.files[0];
  const checkPortrait = document.getElementById('checkPortrait').checked;
  const checkPrivacy = document.getElementById('checkPrivacy').checked;
  
  if (!title) return alert("글 제목을 입력해 주세요.");
  if (!content) return alert("글 내용을 입력해 주세요.");
  
  // 지워졌던 체크리스트 점검 로직 복구
  if (!checkPortrait || !checkPrivacy) {
    return alert("초상권과 개인 정보 보호 체크리스트를 모두 확인해 주세요.");
  }

  submitBtn.disabled = true;
  submitBtn.textContent = editingPostId ? "수정 중..." : "업로드 중...";

  try {
    let imageBase64 = "";

    // 지워졌던 이미지 압축 로직 복구
    if (file) {
      const options = { maxSizeMB: 0.2, maxWidthOrHeight: 800, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);
      imageBase64 = await convertToBase64(compressedFile);
    }

    if (editingPostId) {
      const updateData = {
        title: title, // 제목 수정 추가
        text: content,
        color: fontColorInput.value,
        size: fontSizeSelect.value
      };
      if (imageBase64) updateData.imageUrl = imageBase64;
      await updateDoc(doc(db, "posts", editingPostId), updateData);
    } else {
      const randomColor = pastelColors[Math.floor(Math.random() * pastelColors.length)];
      await addDoc(collection(db, "posts"), {
        author: currentStudentName,
        title: title, // 제목 저장 추가
        text: content,
        color: fontColorInput.value,
        size: fontSizeSelect.value,
        cardColor: randomColor,
        imageUrl: imageBase64 || "",
        comments: [],
        createdAt: serverTimestamp()
      });
    }

    // 팝업 창 닫기 및 초기화
    postContent.value = ""; imageUpload.value = "";
    document.getElementById('checkPortrait').checked = false; document.getElementById('checkPrivacy').checked = false;
    writeModal.style.display = 'none'; 
    editingPostId = null;

  } catch (error) { 
    console.error(error);
    alert("처리 중 에러가 발생했습니다."); 
  } finally { 
    submitBtn.disabled = false; 
    submitBtn.textContent = editingPostId ? "게시글 수정하기" : "게시글 올리기"; 
  }
});

// --- 게시판 실시간 렌더링 및 시스템 상태 제어 ---
const systemStatusMessage = document.createElement('div');
systemStatusMessage.style.textAlign = 'center';
systemStatusMessage.style.padding = '50px';
systemStatusMessage.style.fontSize = '20px';
systemStatusMessage.style.color = '#555';
systemStatusMessage.style.display = 'none';
boardSection.insertBefore(systemStatusMessage, feedSection);

let postsUnsubscribe = null; // 실시간 수신 해제용 변수

function escapeHTML(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, function(match) {
    const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return escapeMap[match];
  });
}

// DB의 설정 상태를 감지하여 화면 제어
onSnapshot(doc(db, 'settings', 'system'), (docSnap) => {
  const isActive = docSnap.data()?.isClassActive;

  if (isActive) {
    // 1. 수업 중: UI 열기 및 데이터 수신 시작
    systemStatusMessage.style.display = 'none';
    feedSection.style.display = 'grid';
    fabWrite.style.display = 'block';

    if (!postsUnsubscribe) {
      const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
      postsUnsubscribe = onSnapshot(q, (snapshot) => {
        feedSection.innerHTML = ""; 
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const postId = docSnap.id;
          const postDiv = document.createElement('div');
          postDiv.className = 'post';
          postDiv.style.backgroundColor = data.cardColor || '#ffffff';
          
          const titleEscaped = escapeHTML(data.title || "제목 없음");
          const textEscaped = escapeHTML(data.text);
          const authorEscaped = escapeHTML(data.author || "익명");
          const isMyPost = data.author === currentStudentName;
          
          const actionButtons = isMyPost ? `
            <div class="post-actions">
              <span class="action-btn edit-btn" data-id="${postId}" data-title="${titleEscaped}" data-text="${textEscaped}" data-color="${data.color}" data-size="${data.size}">✏️</span>
              <span class="action-btn delete-btn" data-id="${postId}">❌</span>
            </div>
          ` : '';

          let htmlContent = actionButtons;
          htmlContent += `<h3 style="margin-top: 0; margin-bottom: 10px; padding-right: 50px;">${data.title || "제목 없음"}</h3>`;
          if (data.imageUrl) htmlContent += `<img src="${data.imageUrl}" alt="첨부 사진">`; 
          htmlContent += `<p style="color:${data.color}; font-size:${data.size}; margin-top:15px; line-height:1.5;">${data.text.replace(/\n/g, '<br>')}</p>`;
          htmlContent += `<div class="author-name" style="margin-top: 15px; border-top: 1px dashed rgba(0,0,0,0.2); padding-top: 10px; text-align: right;">👤 ${data.author || '익명'}</div>`;
          
          htmlContent += `<div class="comments-area">`;
          const comments = data.comments || [];
          comments.forEach(c => {
  htmlContent += `<div class="comment-item"><strong>${escapeHTML(c.author)}</strong>: ${escapeHTML(c.text)}</div>`;
});
          htmlContent += `
              <div class="comment-input-box">
                <input type="text" id="comment-${postId}" placeholder="댓글 달기...">
                <button class="add-comment-btn" data-id="${postId}">입력</button>
              </div>
            </div>
          `;
          
          postDiv.innerHTML = htmlContent;
          feedSection.appendChild(postDiv);
        });
      }, (error) => {
        console.error("데이터 수신 에러:", error);
      });
    }
  } else {
    // 2. 수업 종료: UI 닫기 및 데이터 수신 해제
    systemStatusMessage.innerText = "🔒 현재는 수업이 종료되어 게시판이 닫혀 있습니다.";
    systemStatusMessage.style.display = 'block';
    feedSection.style.display = 'none';
    fabWrite.style.display = 'none';
    
    if (postsUnsubscribe) {
      postsUnsubscribe(); // 권한 에러가 발생하기 전에 미리 연결 차단
      postsUnsubscribe = null;
    }
    feedSection.innerHTML = "";
  }
});

// --- 이벤트 위임 (수정, 삭제, 댓글 달기 클릭 처리) ---
feedSection.addEventListener('click', async (e) => {
  // 1. 글 삭제
  if (e.target.classList.contains('delete-btn')) {
    const postId = e.target.getAttribute('data-id');
    if (confirm("정말 이 글을 삭제할까요?")) {
      await deleteDoc(doc(db, "posts", postId));
    }
  }
  
  // 2. 글 수정 (팝업 창 띄우기)
  if (e.target.classList.contains('edit-btn')) {
    editingPostId = e.target.getAttribute('data-id');
    
    // 기존 데이터 불러오기
    postTitle.value = e.target.getAttribute('data-title');
    postContent.value = e.target.getAttribute('data-text');
    fontColorInput.value = e.target.getAttribute('data-color') || "#000000";
    fontSizeSelect.value = e.target.getAttribute('data-size') || "16px";
    
    // 팝업창 UI 변경
    modalTitle.innerText = "수정하기";
    submitBtn.textContent = "게시글 수정하기";
    
    writeModal.style.display = 'flex';
  }

  // 3. 댓글 달기
  if (e.target.classList.contains('add-comment-btn')) {
    const postId = e.target.getAttribute('data-id');
    const inputEl = document.getElementById(`comment-${postId}`);
    const commentText = inputEl.value.trim();
    if (commentText) {
      await updateDoc(doc(db, "posts", postId), {
        comments: arrayUnion({
          author: currentStudentName,
          text: commentText
        })
      });
      inputEl.value = ""; 
    }
  }
});

// ==========================================
// 사진 편집기 (초상권 보호 모자이크) 로직 추가
// ==========================================
const openEditorBtn = document.getElementById('openEditorBtn');
const editorModal = document.getElementById('editorModal');
const closeEditorBtn = document.getElementById('closeEditorBtn');
const editorUpload = document.getElementById('editorUpload');
const photoCanvas = document.getElementById('photoCanvas');
const ctx = photoCanvas.getContext('2d');
const stickerToolbar = document.getElementById('stickerToolbar');
const downloadBtn = document.getElementById('downloadBtn');
const undoBtn = document.getElementById('undoBtn');

let currentSticker = '😀'; // 기본 스티커
let baseImage = new Image();
let canvasHistory = []; // 되돌리기를 위한 배열

// 팝업 열기/닫기
openEditorBtn.addEventListener('click', () => editorModal.style.display = 'flex');
closeEditorBtn.addEventListener('click', () => editorModal.style.display = 'none');

// 스티커 선택 이벤트
document.querySelectorAll('.sticker-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    currentSticker = e.target.getAttribute('data-emoji');
    // 시각적 피드백 (선택된 스티커 표시)
    document.querySelectorAll('.sticker-btn').forEach(b => b.style.background = 'white');
    e.target.style.background = '#cce0ff';
  });
});

// 사진 불러와서 캔버스에 그리기
editorUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    baseImage.onload = () => {
      // 사진 원본 크기에 맞춰 캔버스 크기 조절
      photoCanvas.width = baseImage.width;
      photoCanvas.height = baseImage.height;
      ctx.drawImage(baseImage, 0, 0);
      
      // 숨겨진 도구들 보이게 하기
      photoCanvas.style.display = 'block';
      stickerToolbar.style.display = 'flex'; // 버튼들을 가로로 예쁘게 정렬
      downloadBtn.style.display = 'block';
      
      // ★ 추가된 부분: 사진을 처음 불렀을 때 100% 비율로 초기화
      updateZoom(1.0); 
      
      // 초기 상태 저장
      canvasHistory = [photoCanvas.toDataURL()]; 
    };
    baseImage.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// 확대/축소 관련 변수
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomLevelText = document.getElementById('zoomLevelText');
let currentZoom = 1.0;
let initialPinchDistance = null;

// 줌(Zoom) 업데이트 함수
function updateZoom(newZoom) {
  currentZoom = Math.max(0.5, Math.min(newZoom, 4.0)); // 50% ~ 400% 제한
  if (zoomLevelText) zoomLevelText.innerText = Math.round(currentZoom * 100) + '%';
  photoCanvas.style.maxWidth = 'none'; // 기본 100% 제한 해제
  photoCanvas.style.width = (currentZoom * 100) + '%';
}

// 버튼 클릭 이벤트
if (zoomInBtn) zoomInBtn.addEventListener('click', () => updateZoom(currentZoom + 0.2));
if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => updateZoom(currentZoom - 0.2));

// 두 손가락 거리 계산 (핀치 줌)
function getDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// 캔버스 터치/클릭 시 스티커 붙이기
function addSticker(e) {
  if (!baseImage.src) return;
  
  // ★ 두 손가락 이상 닿았을 때는 줌 동작이므로 스티커를 붙이지 않음
  if (e.touches && e.touches.length > 1) return;
  
  e.preventDefault(); 
  
  const rect = photoCanvas.getBoundingClientRect();
  const scaleX = photoCanvas.width / rect.width;
  const scaleY = photoCanvas.height / rect.height;
  
  let clientX, clientY;
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX; 
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX; 
    clientY = e.clientY;
  }

  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;

  const baseFontSize = Math.max(photoCanvas.width * 0.15, 50); 
  const fontSize = baseFontSize / currentZoom; 
  
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(currentSticker, x, y);
  
  canvasHistory.push(photoCanvas.toDataURL());
}

// 스티커 이벤트 연결
photoCanvas.addEventListener('mousedown', addSticker);
photoCanvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) initialPinchDistance = getDistance(e.touches);
  addSticker(e);
}, { passive: false });

// 두 손가락 핀치 줌 이동 이벤트
photoCanvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && initialPinchDistance) {
    e.preventDefault(); // 화면 전체 스크롤 방지
    const currentDistance = getDistance(e.touches);
    const zoomChange = (currentDistance - initialPinchDistance) * 0.005; // 민감도 조절
    updateZoom(currentZoom + zoomChange);
    initialPinchDistance = currentDistance;
  }
}, { passive: false });

photoCanvas.addEventListener('touchend', (e) => {
  if (e.touches && e.touches.length < 2) initialPinchDistance = null;
});

// 되돌리기 로직
undoBtn.addEventListener('click', () => {
  if (canvasHistory.length > 1) {
    canvasHistory.pop(); 
    const prevImage = new Image();
    prevImage.onload = () => {
      ctx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
      ctx.drawImage(prevImage, 0, 0);
    };
    prevImage.src = canvasHistory[canvasHistory.length - 1]; 
  }
});

// 다운로드(저장) 로직 (아이패드 호환성 개선)
downloadBtn.addEventListener('click', () => {
  // 1. 캔버스 이미지를 추출
  const dataUrl = photoCanvas.toDataURL('image/png');
  
  // 2. 화면에 꾹 누를 수 있는 실제 <img> 태그 생성 및 표시
  let resultImg = document.getElementById('resultImg');
  if (!resultImg) {
    resultImg = document.createElement('img');
    resultImg.id = 'resultImg';
    resultImg.style.maxWidth = '100%';
    resultImg.style.border = '3px solid #4CAF50'; 
    resultImg.style.borderRadius = '8px';
    resultImg.style.marginTop = '10px';
    photoCanvas.parentNode.insertBefore(resultImg, photoCanvas);
  }
  resultImg.src = dataUrl;
  
  // 3. 기존 캔버스와 툴바 숨기기
  photoCanvas.style.display = 'none';
  document.getElementById('stickerToolbar').style.display = 'none';
  downloadBtn.style.display = 'none';
  
  // 4. 안내창 띄우기
  updateZoom(1.0); 
  alert("✅ 편집이 완료되었습니다!\n\n화면에 나타난 초록색 테두리의 사진을 [손가락으로 꾹~ 누른 후 '사진 앱에 저장']을 선택해 주세요.");
});
