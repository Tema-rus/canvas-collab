const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');  // ✅ Добавили!

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

let sharedStrokes = [];
let sharedBgColor = '#ffffff';
let sharedBackground = null;
let currentStrokes = {};

io.on('connection', (socket) => {
    socket.emit('state', { strokes: sharedStrokes, bgColor: sharedBgColor });
    if (sharedBackground) socket.emit('setBackground', sharedBackground);

    socket.on('draw', (data) => {
        if (data.type === 'start') {
            currentStrokes[socket.id] = {
                color: data.color,
                size: data.size,
                points: [{ x: data.x, y: data.y }]
            };
        } else if (data.type === 'draw' && currentStrokes[socket.id]) {
            currentStrokes[socket.id].points.push({ x: data.x, y: data.y });
        }
        socket.broadcast.emit('draw', data);
    });

    socket.on('stop', () => {
        if (currentStrokes[socket.id]) {
            sharedStrokes.push({ type: 'stroke', ...currentStrokes[socket.id] });
            delete currentStrokes[socket.id];
            io.emit('state', { strokes: sharedStrokes, bgColor: sharedBgColor });
        }
    });

    socket.on('clear', (data) => {
        sharedBgColor = data.bgColor || '#ffffff';
        sharedStrokes = [];
        io.emit('state', { strokes: sharedStrokes, bgColor: sharedBgColor });
    });

    socket.on('undo', () => {
        if (sharedStrokes.length) {
            sharedStrokes.pop();
            io.emit('state', { strokes: sharedStrokes, bgColor: sharedBgColor });
        }
    });

    socket.on('fill', (data) => {
        sharedStrokes.push({ type: 'fill', ...data });
        io.emit('state', { strokes: sharedStrokes, bgColor: sharedBgColor });
    });

    socket.on('fillArea', (data) => socket.broadcast.emit('fillArea', data));

    socket.on('setBackground', (data) => {
        sharedBackground = data;
        socket.broadcast.emit('setBackground', data);
    });

    socket.on('removeBackground', () => socket.broadcast.emit('removeBackground'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎨 Canvas collab на :${PORT}`);
});
