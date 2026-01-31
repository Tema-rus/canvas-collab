const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const colorInput = document.getElementById('color');
const sizeInput = document.getElementById('size');

let drawing = false;
let currentStroke = null;
let sharedBgColor = '#ffffff';
let backgroundImage = null;
let localStrokes = [];
let eraserMode = false;

// Zoom и pan
let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;

// Touch zoom (two-finger pinch)
let lastTouchDistance = 0;

// Точка зума
let zoomCenterX = 0;
let zoomCenterY = 0;

// DPI коррекция
const dpr = window.devicePixelRatio || 1;

const socket = io();

function resizeCanvas() {
    const toolbar = document.getElementById('toolbar');
    const displayWidth = window.innerWidth - 20;
    const displayHeight = window.innerHeight - toolbar.offsetHeight - 20;

    // Устанавливаем размер отображения
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';

    // Устанавливаем реальный размер canvas с учётом DPI
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    // Масштабируем контекст
    ctx.scale(dpr, dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    redrawCanvas();
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    // Поддержка touch и mouse
    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    // Вычисляем позицию БЕЗ учёта DPI (используем display размеры)
    const x = (clientX - rect.left - panX) / zoomLevel;
    const y = (clientY - rect.top - panY) / zoomLevel;
    return { x, y };
}

function getTouchDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function startDraw(e) {
    // Две точки касания - pan
    if (e.touches && e.touches.length === 2) {
        e.preventDefault();
        isPanning = true;
        lastTouchDistance = getTouchDistance(e.touches);
        lastPanX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        lastPanY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        return;
    }

    // Средняя кнопка мыши - pan
    if (e.button === 1) {
        e.preventDefault();
        isPanning = true;
        lastPanX = e.clientX;
        lastPanY = e.clientY;
        return;
    }

    e.preventDefault();
    drawing = true;
    const { x, y } = getPos(e);
    currentStroke = {
        color: eraserMode ? sharedBgColor : colorInput.value,
        size: parseInt(sizeInput.value),
        points: [{ x, y }],
        isEraser: eraserMode
    };

    socket.emit('draw', { type: 'start', x, y, color: currentStroke.color, size: currentStroke.size });
    socket.emit('cursorMove', { x, y });
}

function draw(e) {
    // Touch zoom (pinch)
    if (e.touches && e.touches.length === 2) {
        const currentDistance = getTouchDistance(e.touches);
        if (lastTouchDistance > 0) {
            const scale = currentDistance / lastTouchDistance;
            if (scale > 1.05) {
                // Зум к центру между двумя пальцами
                const rect = canvas.getBoundingClientRect();
                zoomCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                zoomCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
                zoom('in');
                lastTouchDistance = currentDistance;
            } else if (scale < 0.95) {
                const rect = canvas.getBoundingClientRect();
                zoomCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                zoomCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
                zoom('out');
                lastTouchDistance = currentDistance;
            }
        }
        return;
    }

    if (isPanning) {
        // Обновляем pan при движении средней кнопки или двух пальцев
        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        panX += clientX - lastPanX;
        panY += clientY - lastPanY;
        lastPanX = clientX;
        lastPanY = clientY;
        redrawCanvas();
        return;
    }

    if (!drawing) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    currentStroke.points.push({ x, y });
    redrawCanvas();
    socket.emit('draw', { type: 'draw', x, y, color: currentStroke.color, size: currentStroke.size });
    socket.emit('cursorMove', { x, y });
}

function stopDraw(e) {
    if (e.touches && e.touches.length > 0) {
        return; // Всё ещё касаемся экрана
    }

    if (isPanning) {
        isPanning = false;
        return;
    }

    if (!drawing) return;
    drawing = false;
    if (currentStroke) {
        socket.emit('stop');
        currentStroke = null;
    }
}

function clearCanvas() {
    socket.emit('clear', { bgColor: sharedBgColor });
}

function saveImage() {
    const link = document.createElement('a');
    link.download = "наш-рисунок.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
}

function undo() {
    socket.emit('undo');
}

function toggleEraser() {
    eraserMode = !eraserMode;
    const btn = document.getElementById('eraserBtn');
    btn.textContent = eraserMode ? '✏️ Карандаш' : '🧹 Ластик';
}

function removeBackground() {
    backgroundImage = null;

    // Возвращаем размер canvas к стандартному
    const toolbar = document.getElementById('toolbar');
    const displayWidth = window.innerWidth - 20;
    const displayHeight = window.innerHeight - toolbar.offsetHeight - 20;

    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    // Сброс матрицы + DPI
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    redrawCanvas();
    socket.emit('removeBackground');
}


function uploadBackground() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                backgroundImage = img;

                // ✅ СБРОС матрицы
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.scale(dpr, dpr);

                redrawCanvas();
                socket.emit('setBackground', { image: event.target.result, width: img.width, height: img.height });
            };

            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

function zoom(direction) {
    const rect = canvas.getBoundingClientRect();

    // Если точка зума не установлена, зумим к центру экрана
    if (zoomCenterX === 0 && zoomCenterY === 0) {
        zoomCenterX = rect.width / 2;
        zoomCenterY = rect.height / 2;
    }

    const oldZoom = zoomLevel;

    if (direction === 'in') {
        zoomLevel *= 1.2;
    } else {
        zoomLevel /= 1.2;
    }
    zoomLevel = Math.max(0.5, Math.min(zoomLevel, 5));

    // Корректируем pan чтобы зумить к точке
    const zoomFactor = zoomLevel / oldZoom;
    panX = zoomCenterX - (zoomCenterX - panX) * zoomFactor;
    panY = zoomCenterY - (zoomCenterY - panY) * zoomFactor;

    redrawCanvas();
}

// Zoom колёсиком мыши
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Зумим к позиции курсора
    const rect = canvas.getBoundingClientRect();
    zoomCenterX = e.clientX - rect.left;
    zoomCenterY = e.clientY - rect.top;

    if (e.deltaY < 0) {
        zoom('in');
    } else {
        zoom('out');
    }
}, { passive: false });

function redrawCanvas() {
    const displayWidth = canvas.style.width ? parseInt(canvas.style.width) : canvas.width / dpr;
    const displayHeight = canvas.style.height ? parseInt(canvas.style.height) : canvas.height / dpr;

    // Очищаем весь canvas (с учётом DPI)
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Сохраняем контекст
    ctx.save();

    // Применяем pan и zoom
    ctx.translate(panX, panY);
    ctx.scale(zoomLevel, zoomLevel);

    // Рисуем фон
    ctx.fillStyle = sharedBgColor;
    if (backgroundImage) {
        const canvasDisplayWidth = canvas.style.width ? parseFloat(canvas.style.width) : window.innerWidth - 20;
        const canvasDisplayHeight = canvas.style.height ? parseFloat(canvas.style.height) : window.innerHeight - 140;

        ctx.drawImage(
            backgroundImage,
            0, 0, backgroundImage.naturalWidth, backgroundImage.naturalHeight,
            0, 0, canvasDisplayWidth / zoomLevel, canvasDisplayHeight / zoomLevel
        );
    } else {
        ctx.fillRect(0, 0, displayWidth / zoomLevel, displayHeight / zoomLevel);
    }


    // Рисуем все сохранённые линии
    for (const stroke of localStrokes) {
        if (stroke.type === 'stroke') {
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.size / zoomLevel;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            stroke.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.stroke();
        }
    }

    // Рисуем текущий штрих если идёт рисование
    if (drawing && currentStroke && currentStroke.points.length > 0) {
        ctx.strokeStyle = currentStroke.color;
        ctx.lineWidth = currentStroke.size / zoomLevel;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        currentStroke.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
    }

    // Восстанавливаем контекст
    ctx.restore();
}

// События мыши
canvas.addEventListener('pointerdown', startDraw, { passive: false });
canvas.addEventListener('pointermove', draw, { passive: false });
canvas.addEventListener('pointerup', stopDraw, { passive: false });
canvas.addEventListener('pointerleave', stopDraw, { passive: false });
canvas.addEventListener('pointercancel', stopDraw, { passive: false });

// Дополнительные touch события для лучшей совместимости
canvas.addEventListener('touchstart', startDraw, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDraw, { passive: false });
canvas.addEventListener('touchcancel', stopDraw, { passive: false });

socket.on('state', (data) => {
    sharedBgColor = data.bgColor;
    localStrokes = data.strokes;
    redrawCanvas();
});

socket.on('setBackground', (data) => {
    const img = new Image();
    img.onload = () => {
        backgroundImage = img;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        redrawCanvas();
    };
    img.src = data.image;
});

socket.on('removeBackground', () => {
    backgroundImage = null;

    // Возвращаем стандартный размер
    const toolbar = document.getElementById('toolbar');
    const displayWidth = window.innerWidth - 20;
    const displayHeight = window.innerHeight - toolbar.offsetHeight - 20;

    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    redrawCanvas();
});

socket.on('cursorMove', (data) => {
    console.log(`Cursor другого: (${data.x}, ${data.y})`);
});

socket.on('draw', (data) => {
    if (data.type === 'start') {
        // Ничего не делаем - просто получаем событие
    } else if (data.type === 'draw') {
        // Рисование идёт через socket.on('state')
    }
});