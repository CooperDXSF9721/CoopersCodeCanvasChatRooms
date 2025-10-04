// ==================== Firebase Config ====================
const firebaseConfig = {
  apiKey: "AIzaSyBUfT7u7tthl3Nm-ePsY7XWrdLK7YNoLVQ",
  authDomain: "cooperscodeart.firebaseapp.com",
  projectId: "cooperscodeart",
  storageBucket: "cooperscodeart.firebasestorage.app",
  messagingSenderId: "632469567217",
  appId: "1:632469567217:web:14278c59ad762e67eedb50",
  measurementId: "G-NXS0EPJR61"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==================== Room Management ====================
let currentRoomId = null;
let linesRef = null;
let textsRef = null;

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function joinRoom(roomId) {
  if (linesRef) linesRef.off();
  if (textsRef) textsRef.off();
  
  currentRoomId = roomId;
  linesRef = db.ref(`rooms/${roomId}/lines`);
  textsRef = db.ref(`rooms/${roomId}/texts`);
  
  linesCache.length = 0;
  textsCache.clear();
  drawAll();
  
  setupFirebaseListeners();
  updateRoomIndicator();
  
  window.location.hash = roomId;
}

function updateRoomIndicator() {
  const indicator = document.getElementById('roomIndicator');
  const menuBtn = document.getElementById('roomMenuBtn');
  const displayEl = document.getElementById('currentRoomDisplay');
  
  if (indicator && currentRoomId) {
    if (currentRoomId === 'public') {
      indicator.textContent = 'Public Canvas';
      menuBtn?.classList.add('public');
      if (displayEl) {
        displayEl.textContent = 'PUBLIC';
        displayEl.style.color = 'hsl(220, 90%, 56%)';
      }
    } else {
      indicator.textContent = currentRoomId;
      menuBtn?.classList.remove('public');
      if (displayEl) {
        displayEl.textContent = currentRoomId;
        displayEl.style.color = 'hsl(142, 76%, 55%)';
      }
    }
  }
}

function setupFirebaseListeners() {
  linesRef.on('child_added', snapshot => {
    const line = snapshot.val();
    linesCache.push(line);
    line.points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, line.width / 2, 0, Math.PI * 2);
      if (line.erase) { 
        ctx.globalCompositeOperation = 'destination-out'; 
        ctx.fillStyle = 'rgba(0,0,0,1)'; 
      } else { 
        ctx.globalCompositeOperation = 'source-over'; 
        ctx.fillStyle = line.color; 
      }
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  });

  linesRef.on('value', snapshot => {
    if (!snapshot.exists()) {
      linesCache.length = 0;
      drawAll();
    }
  });

  textsRef.on('child_added', snapshot => {
    const key = snapshot.key;
    const val = snapshot.val();
    textsCache.set(key, val);
    drawAll();
  });

  textsRef.on('child_changed', snapshot => {
    const key = snapshot.key;
    const val = snapshot.val();
    textsCache.set(key, val);
    drawAll();
  });

  textsRef.on('child_removed', snapshot => {
    const key = snapshot.key;
    textsCache.delete(key);
    drawAll();
  });
}

// ==================== Canvas Setup ====================
const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const linesCache = [];
const textsCache = new Map();

function drawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  linesCache.forEach(line => {
    const { points, color, width, erase } = line;
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, width/2, 0, Math.PI*2);
      if (erase) { 
        ctx.globalCompositeOperation = 'destination-out'; 
        ctx.fillStyle = 'rgba(0,0,0,1)'; 
      } else { 
        ctx.globalCompositeOperation = 'source-over'; 
        ctx.fillStyle = color; 
      }
      ctx.fill();
    });
  });
  ctx.globalCompositeOperation = 'source-over';
  ctx.textBaseline = 'top';
  textsCache.forEach(obj => {
    const size = obj.size || 40;
    const color = obj.color || '#000';
    const content = obj.text || '';
    if (!content) return;
    ctx.font = `${size}px sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(content, obj.x, obj.y);
  });
}

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  drawAll();
});

// ==================== Drawing State ====================
let brushColor = "#000000";
let brushSize = 4;
let drawing = false;
let current = { x: 0, y: 0 };
let eraserActive = false;

function drawLineSmooth(x0, y0, x1, y1, color = brushColor, width = brushSize, erase = false) {
  const points = [];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const distance = Math.sqrt(dx*dx + dy*dy);
  const steps = Math.ceil(distance / 2);

  for (let i = 0; i <= steps; i++) {
    const xi = x0 + (dx * i) / steps;
    const yi = y0 + (dy * i) / steps;
    points.push({ x: xi, y: yi });
    ctx.beginPath();
    ctx.arc(xi, yi, width / 2, 0, Math.PI * 2);
    if (erase) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
    }
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  return points;
}

// ==================== Pointer Handling & Text Dragging ====================
function startDrawing(x, y) { drawing = true; current.x = x; current.y = y; }
function stopDrawing() { drawing = false; }

function textAtPoint(x, y) {
  let found = null;
  textsCache.forEach((t, key) => {
    const size = t.size || 40;
    const content = t.text || '';
    if (!content) return;
    ctx.font = `${size}px sans-serif`;
    ctx.textBaseline = 'top';
    const w = ctx.measureText(content).width;
    const h = size;
    if (x >= t.x && x <= t.x + w && y >= t.y && y <= t.y + h) {
      found = { key, t };
    }
  });
  return found;
}

let draggingTextKey = null;
let dragOffset = { x: 0, y: 0 };
let dragRAFQueued = false;
let latestDragPos = null;

function scheduleDragUpdate() {
  if (dragRAFQueued) return;
  dragRAFQueued = true;
  requestAnimationFrame(() => {
    dragRAFQueued = false;
    if (!draggingTextKey || !latestDragPos) return;
    const { x, y } = latestDragPos;
    const local = textsCache.get(draggingTextKey);
    if (local) { local.x = x; local.y = y; }
    drawAll();
    textsRef.child(draggingTextKey).update({ x, y });
  });
}

function handlePointerDown(x, y) {
  const hit = textAtPoint(x, y);
  if (hit) {
    draggingTextKey = hit.key;
    dragOffset.x = x - hit.t.x;
    dragOffset.y = y - hit.t.y;
    return;
  }
  startDrawing(x, y);
}

function drawMove(x, y) {
  if (draggingTextKey) {
    latestDragPos = { x: x - dragOffset.x, y: y - dragOffset.y };
    scheduleDragUpdate();
    return;
  }
  if (!drawing) return;
  const points = drawLineSmooth(current.x, current.y, x, y, brushColor, brushSize, eraserActive);
  if (eraserActive && points && points.length) {
    const removed = new Set();
    points.forEach(p => {
      const hit = textAtPoint(p.x, p.y);
      if (hit && !removed.has(hit.key)) {
        removed.add(hit.key);
        textsRef.child(hit.key).remove();
      }
    });
  }
  linesRef.push({ points, color: brushColor, width: brushSize, erase: eraserActive });
  current.x = x;
  current.y = y;
}

function handlePointerUp() {
  drawing = false;
  draggingTextKey = null;
  latestDragPos = null;
  dragRAFQueued = false;
}

canvas.addEventListener('mousedown', e => handlePointerDown(e.clientX, e.clientY));
canvas.addEventListener('mouseup', () => handlePointerUp());
canvas.addEventListener('mouseout', () => handlePointerUp());
canvas.addEventListener('mousemove', e => drawMove(e.clientX, e.clientY));

canvas.addEventListener('touchstart', e => { 
  e.preventDefault(); 
  const t = e.touches[0]; 
  handlePointerDown(t.clientX, t.clientY); 
});
canvas.addEventListener('touchend', e => { 
  e.preventDefault(); 
  handlePointerUp(); 
});
canvas.addEventListener('touchmove', e => { 
  e.preventDefault(); 
  const t = e.touches[0]; 
  drawMove(t.clientX, t.clientY); 
});

// ==================== UI Controls ====================
const colorPicker = document.getElementById('colorPicker');
const sizePicker = document.getElementById('sizePicker');
if (sizePicker) {
  sizePicker.max = '200';
  sizePicker.setAttribute('max', '200');
}
const eraserBtn = document.getElementById('eraserBtn');
const clearBtn = document.getElementById('clearBtn');
const freeTextInput = document.getElementById('freeTextInput');
const addTextBtn = document.getElementById('addTextBtn');

let textSizePicker = document.getElementById('textSizePicker');
if (!textSizePicker) {
  const toolbarEl = document.getElementById('toolbar') || document.body;
  textSizePicker = document.createElement('input');
  textSizePicker.type = 'number';
  textSizePicker.id = 'textSizePicker';
  textSizePicker.min = '10';
  textSizePicker.max = '200';
  textSizePicker.value = '40';
  textSizePicker.title = 'Text size (px)';
  textSizePicker.style.width = '70px';
  if (toolbarEl && addTextBtn && addTextBtn.parentElement === toolbarEl) {
    toolbarEl.insertBefore(textSizePicker, addTextBtn);
  } else if (toolbarEl) {
    toolbarEl.appendChild(textSizePicker);
  } else {
    document.body.appendChild(textSizePicker);
  }
}

const getTextSize = () => {
  const n = parseInt(textSizePicker.value, 10);
  if (Number.isNaN(n)) return 40;
  return Math.max(10, Math.min(200, n));
};

colorPicker.addEventListener('change', e => {
  brushColor = e.target.value;
  eraserActive = false;
  eraserBtn.style.backgroundColor = '';
});

const updateBrushSize = (raw) => {
  const val = parseInt(raw, 10);
  if (!Number.isNaN(val)) {
    brushSize = Math.max(1, Math.min(200, val));
  }
};
sizePicker.addEventListener('input', e => updateBrushSize(e.target.value));
sizePicker.addEventListener('change', e => updateBrushSize(e.target.value));

eraserBtn.addEventListener('click', () => {
  eraserActive = !eraserActive;
  eraserBtn.style.backgroundColor = eraserActive ? 'orange' : '';
});

addTextBtn.addEventListener('click', () => {
  const content = (freeTextInput.value || '').trim();
  if (!content || !currentRoomId) return;
  const size = getTextSize();
  const x = current.x || canvas.width / 2;
  const y = current.y || canvas.height / 2;
  textsRef.push({ x, y, text: content, size, color: brushColor });
  freeTextInput.value = '';
});

// ==================== Room UI ====================
const roomDropdown = document.getElementById('roomDropdown');
const roomMenuBtn = document.getElementById('roomMenuBtn');

roomMenuBtn?.addEventListener('click', () => {
  roomDropdown.classList.toggle('show');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.room-menu-container')) {
    roomDropdown?.classList.remove('show');
  }
});

document.getElementById('createRoomBtn')?.addEventListener('click', async () => {
  const roomId = generateRoomCode();
  
  // Write initial data to mark room as created
  try {
    await db.ref(`rooms/${roomId}/created`).set(Date.now());
    joinRoom(roomId);
    roomDropdown.classList.remove('show');
  } catch (error) {
    console.error('Error creating room:', error);
    alert('Error creating room. Please try again.');
  }
});

document.getElementById('joinRoomBtn')?.addEventListener('click', async () => {
  const roomId = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (roomId) {
    // Check if room exists before joining
    try {
      const roomRef = db.ref(`rooms/${roomId}`);
      const snapshot = await roomRef.once('value');
      
      if (snapshot.exists()) {
        joinRoom(roomId);
        roomDropdown.classList.remove('show');
        document.getElementById('roomCodeInput').value = '';
      } else {
        alert('Invalid Room Code - This room does not exist yet. Please create a new room or enter a valid room code.');
      }
    } catch (error) {
      console.error('Error checking room:', error);
      alert('Error checking room. Please try again.');
    }
  }
});

document.getElementById('goPublicBtn')?.addEventListener('click', () => {
  joinRoom('public');
  roomDropdown.classList.remove('show');
});

document.getElementById('copyRoomBtn')?.addEventListener('click', () => {
  if (currentRoomId) {
    navigator.clipboard.writeText(currentRoomId);
    const btn = document.getElementById('copyRoomBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = originalText, 1500);
  }
});

// ==================== Admin ====================
(function setupAdmin() {
  const adminKey = "cooper";
  const isAdmin = prompt("Enter admin key to see admin tools (or cancel):") === adminKey;
  if (isAdmin) {
    clearBtn.style.display = 'inline-block';
    clearBtn.addEventListener('click', async () => {
      if (!currentRoomId) return;
      try {
        await Promise.all([
          linesRef.remove(),
          textsRef.remove()
        ]);
      } catch (err) {
        console.error('Failed to clear canvas data:', err);
      }
    });
  }
})();

// ==================== Initialize ====================
window.addEventListener('load', () => {
  const hashRoom = window.location.hash.substring(1);
  if (hashRoom) {
    joinRoom(hashRoom);
  } else {
    joinRoom('public');
  }
});
