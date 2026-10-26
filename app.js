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
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 800, useWebWorker: true };
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

// --- 게시판 실시간 렌더링 ---
const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
  feedSection.innerHTML = ""; 
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const postId = docSnap.id;
    const postDiv = document.createElement('div');
    postDiv.className = 'post';
    postDiv.style.backgroundColor = data.cardColor || '#ffffff';
    
    const textEscaped = data.text.replace(/"/g, '&quot;');
    const titleEscaped = data.title ? data.title.replace(/"/g, '&quot;') : "제목 없음";
    const isMyPost = data.author === currentStudentName;
    
    // 수정/삭제 버튼 (데이터에 title 추가)
    const actionButtons = isMyPost ? `
      <div class="post-actions">
        <span class="action-btn edit-btn" data-id="${postId}" data-title="${titleEscaped}" data-text="${textEscaped}" data-color="${data.color}" data-size="${data.size}">✏️</span>
        <span class="action-btn delete-btn" data-id="${postId}">❌</span>
      </div>
    ` : '';

    let htmlContent = actionButtons;

    // 1. 제목 표시
    htmlContent += `<h3 style="margin-top: 0; margin-bottom: 10px; padding-right: 50px;">${data.title || "제목 없음"}</h3>`;

    // 2. 그림 표시
    if (data.imageUrl) { htmlContent += `<img src="${data.imageUrl}" alt="첨부 사진">`; }
    
    // 3. 내용 표시
    htmlContent += `<p style="color:${data.color}; font-size:${data.size}; margin-top:15px; line-height:1.5;">${data.text.replace(/\n/g, '<br>')}</p>`;
    
    // 4. 글쓴이 표시 (구분선과 함께 아래쪽에 배치)
    htmlContent += `
      <div class="author-name" style="margin-top: 15px; border-top: 1px dashed rgba(0,0,0,0.2); padding-top: 10px; text-align: right;">
        👤 ${data.author || '익명'}
      </div>
    `;
    
    // 댓글 렌더링
    htmlContent += `<div class="comments-area">`;
    const comments = data.comments || [];
    comments.forEach(c => {
      htmlContent += `<div class="comment-item"><strong>${c.author}</strong>: ${c.text}</div>`;
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