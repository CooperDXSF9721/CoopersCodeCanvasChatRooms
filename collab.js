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
let roomDeletedRef = null;
let shapesRef = null;

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function joinRoom(roomId, password = null) {
  // Check if room has password protection (skip for public)
  if (roomId !== 'public') {
    const roomRef = db.ref(`rooms/${roomId}`);
    const roomSnapshot = await roomRef.once('value');
    
    // Check if room has any data (lines, texts, or password)
    const roomData = roomSnapshot.val();
    
    // Check if room was deleted or doesn't exist
    if (!roomData || roomData.deleted === true) {
      alert('Room does not exist');
      joinRoom('public');
      return;
    }
    
    const hasLines = roomData && roomData.lines;
    const hasTexts = roomData && roomData.texts;
    const hasPassword = roomData && roomData.password;
    
    // If room has been explicitly created (has password) or has content, it exists
    // Otherwise, treat it as a new room
    const roomExists = hasPassword || hasLines || hasTexts;
    
    if (!roomExists && roomData === null) {
      // Room doesn't exist at all
      alert('Room does not exist');
      joinRoom('public');
      return;
    }
    
    // Check password protection
    const passwordRef = db.ref(`rooms/${roomId}/password`);
    const passwordSnapshot = await passwordRef.once('value');
    const storedPassword = passwordSnapshot.val();

    if (storedPassword) {
      // Room is password protected
      if (password === null) {
        // Prompt for password
        const inputPassword = prompt('This room is password protected. Enter the passkey:');
        if (!inputPassword) {
          joinRoom('public');
          return;
        }
        password = inputPassword;
      }

      if (password !== storedPassword) {
        alert('Incorrect Passkey');
        joinRoom('public');
        return;
      }
    }
  }

  if (linesRef) linesRef.off();
  if (textsRef) textsRef.off();
  if (roomDeletedRef) roomDeletedRef.off();
  if (shapesRef) shapesRef.off();

  currentRoomId = roomId;
  linesRef = db.ref(`rooms/${roomId}/lines`);
  textsRef = db.ref(`rooms/${roomId}/texts`);
  shapesRef = db.ref(`rooms/${roomId}/shapes`);

  linesCache.length = 0;
  textsCache.clear();
  shapesCache.clear();
  drawAll();

  setupFirebaseListeners();
  setupRoomDeletionListener();
  updateRoomIndicator();

  window.location.hash = roomId;
}

function setupRoomDeletionListener() {
  if (currentRoomId === 'public') return;
  
  roomDeletedRef = db.ref(`rooms/${currentRoomId}/deleted`);
  roomDeletedRef.on('value', snapshot => {
    if (snapshot.val() === true) {
      alert('Sorry, this room has been deleted by the owner.');
      joinRoom('public');
    }
  });
}

function updateRoomIndicator() {
  const indicator = document.getElementById('roomIndicator');
  const menuBtn = document.getElementById('roomMenuBtn');
  const roomCodeDisplay = document.getElementById('roomCodeDisplay');
  const deleteBtn = document.getElementById('deleteRoomBtn');
  const copyBtn = document.getElementById('copyRoomBtn');

  if (indicator && currentRoomId) {
    if (currentRoomId === 'public') {
      indicator.textContent = 'Public Canvas';
      menuBtn?.classList.add('public');
      if (roomCodeDisplay) {
        roomCodeDisplay.textContent = 'You are on the public canvas';
        roomCodeDisplay.style.fontFamily = 'Inter, system-ui, sans-serif';
      }
      // Hide delete and copy buttons on public canvas
      if (deleteBtn) deleteBtn.style.display = 'none';
      if (copyBtn) copyBtn.style.display = 'none';
    } else {
      indicator.textContent = currentRoomId;
      menuBtn?.classList.remove('public');
      if (roomCodeDisplay) {
        roomCodeDisplay.textContent = currentRoomId;
        roomCodeDisplay.style.fontFamily = "'JetBrains Mono', 'Courier New', monospace";
      }
      // Show delete and copy buttons on private rooms
      if (deleteBtn) deleteBtn.style.display = 'block';
      if (copyBtn) copyBtn.style.display = 'block';
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

  shapesRef.on('child_added', snapshot => {
    const key = snapshot.key;
    const val = snapshot.val();
    shapesCache.set(key, val);
    drawAll();
  });

  shapesRef.on('child_removed', snapshot => {
    const key = snapshot.key;
    shapesCache.delete(key);
    drawAll();
  });
}

// ==================== Canvas Setup ====================
let canvas, ctx;
const linesCache = [];
const textsCache = new Map();
const shapesCache = new Map();

function initCanvas() {
  canvas = document.getElementById('drawCanvas');
  ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

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
  
  // Draw shapes
  shapesCache.forEach(shape => {
    drawShape(shape);
  });
  
  // Draw text
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

// ==================== Shape Drawing ====================
function drawShape(shape) {
  const { type, x, y, size, color, hollow } = shape;
  
  ctx.save();
  ctx.translate(x, y);
  
  if (hollow) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
  } else {
    ctx.fillStyle = color;
  }
  
  ctx.beginPath();
  
  switch(type) {
    case 'circle':
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      break;
      
    case 'square':
      const half = size / 2;
      ctx.rect(-half, -half, size, size);
      break;
      
    case 'triangle':
      const h = size * Math.sqrt(3) / 2;
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(-size / 2, h / 2);
      ctx.lineTo(size / 2, h / 2);
      ctx.closePath();
      break;
      
    case 'star':
      const spikes = 5;
      const outerRadius = size / 2;
      const innerRadius = size / 4;
      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const px = radius * Math.cos(angle);
        const py = radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
      
    case 'heart':
      const w = size / 2;
      ctx.moveTo(0, w / 4);
      ctx.bezierCurveTo(-w, -w / 2, -w, -w, -w / 2, -w);
      ctx.bezierCurveTo(0, -w, 0, -w / 2, 0, w / 4);
      ctx.bezierCurveTo(0, -w / 2, 0, -w, w / 2, -w);
      ctx.bezierCurveTo(w, -w, w, -w / 2, 0, w / 4);
      break;
      
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const px = (size / 2) * Math.cos(angle);
        const py = (size / 2) * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
      
    case 'flower':
      const petals = 6;
      const petalRadius = size / 3;
      for (let i = 0; i < petals; i++) {
        const angle = (i * 2 * Math.PI) / petals;
        const cx = (size / 4) * Math.cos(angle);
        const cy = (size / 4) * Math.sin(angle);
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, petalRadius, 0, Math.PI * 2);
      }
      // Center circle
      ctx.moveTo(size / 8, 0);
      ctx.arc(0, 0, size / 8, 0, Math.PI * 2);
      break;
  }
  
  if (hollow) {
    ctx.stroke();
  } else {
    ctx.fill();
  }
  
  ctx.restore();
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
  const password = prompt('Set a passkey for this room (optional - leave blank for no password):');

  if (password && password.trim()) {
    // Save password to Firebase
    await db.ref(`rooms/${roomId}/password`).set(password.trim());
  }

  joinRoom(roomId);
  roomDropdown.classList.remove('show');
});

document.getElementById('joinRoomBtn')?.addEventListener('click', () => {
  const roomId = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (roomId) {
    joinRoom(roomId);
    roomDropdown.classList.remove('show');
  }
});

document.getElementById('goPublicBtn')?.addEventListener('click', () => {
  joinRoom('public');
  roomDropdown.classList.remove('show');
});

document.getElementById('copyRoomBtn')?.addEventListener('click', () => {
  if (currentRoomId && currentRoomId !== 'public') {
    navigator.clipboard.writeText(currentRoomId);
    const btn = document.getElementById('copyRoomBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = originalText, 1500);
  }
});

document.getElementById('deleteRoomBtn')?.addEventListener('click', async () => {
  if (currentRoomId && currentRoomId !== 'public') {
    const confirmDelete = confirm(`Are you sure you want to delete room ${currentRoomId}? This will kick all users from the room.`);
    if (confirmDelete) {
      // First, set the deleted flag to kick other users
      await db.ref(`rooms/${currentRoomId}/deleted`).set(true);
      
      // Wait a moment for other users to be kicked
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Then delete the entire room from Firebase
      await db.ref(`rooms/${currentRoomId}`).remove();
      
      alert('Room deleted successfully');
      joinRoom('public');
      roomDropdown.classList.remove('show');
    }
  }
});

// ==================== Initialize ====================
window.addEventListener('load', () => {
  // Initialize canvas first
  initCanvas();
  
  // Setup admin
  setupAdmin();
  
  // Join room
  const hashRoom = window.location.hash.substring(1);
  if (hashRoom) {
    joinRoom(hashRoom);
  } else {
    joinRoom('public');
  }
  
  // Setup shape menu
  setupShapeMenu();
});

// ==================== Admin ====================
function setupAdmin() {
  const adminKey = "cooper";
  const isAdmin = prompt("Enter admin key to see admin tools (or cancel):") === adminKey;
  const clearBtn = document.getElementById('clearBtn');
  if (isAdmin && clearBtn) {
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
}

// ==================== Shape Menu ====================
function setupShapeMenu() {
  const shapeMenuBtn = document.getElementById('shapeMenuBtn');
  const shapeMenu = document.getElementById('shapeMenu');
  const shapeButtons = document.querySelectorAll('.shape-btn');
  const shapeColorPicker = document.getElementById('shapeColorPicker');
  const shapeSizeInput = document.getElementById('shapeSizeInput');
  
  let selectedShapeType = null;
  let selectedHollow = false;
  
  shapeMenuBtn?.addEventListener('click', () => {
    shapeMenu.classList.toggle('show');
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.shape-menu-container')) {
      shapeMenu?.classList.remove('show');
    }
  });
  
  shapeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const shapeType = btn.dataset.shape;
      const hollow = btn.dataset.hollow === 'true';
      
      selectedShapeType = shapeType;
      selectedHollow = hollow;
      
      // Visual feedback
      shapeButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  
  canvas.addEventListener('click', (e) => {
    if (selectedShapeType && !drawing && !draggingTextKey) {
      const shapeColor = shapeColorPicker.value;
      const shapeSize = parseInt(shapeSizeInput.value) || 100;
      
      const shapeData = {
        type: selectedShapeType,
        x: e.clientX,
        y: e.clientY,
        size: shapeSize,
        color: shapeColor,
        hollow: selectedHollow
      };
      
      shapesRef.push(shapeData);
      
      // Deselect shape after placing
      selectedShapeType = null;
      selectedHollow = false;
      shapeButtons.forEach(b => b.classList.remove('selected'));
    }
  });
}
