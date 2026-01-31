const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use(express.static('.'));

let sharedStrokes = [];  // ЕДИНСТВЕННЫЙ массив strokes
let sharedBgColor = '#ffffff';
let sharedBackground = null;  // Хранит изображение фона
let currentStrokes = {};  // временные линии

io.on('connection', (socket) => {
    // Отправляем текущее состояние
    socket.emit('state', { strokes: sharedStrokes, bgColor: sharedBgColor });

    // Если есть фон, отправляем его новому пользователю
    if (sharedBackground) {
        socket.emit('setBackground', sharedBackground);
    }

    socket.on('draw', (data) => {
        if (data.type === 'start') {
            currentStrokes[socket.id] = { color: data.color, size: data.size, points: [{ x: data.x, y: data.y }] };
        } else if (data.type === 'draw') {
            if (currentStrokes[socket.id]) {
                currentStrokes[socket.id].points.push({ x: data.x, y: data.y });
            }
        }
        socket.broadcast.emit('draw', data);
    });

    socket.on('stop', () => {
        if (currentStrokes[socket.id]) {
            // СОХРАНЯЕМ В sharedStrokes!
            sharedStrokes.push({ type: 'stroke', ...currentStrokes[socket.id] });
            delete currentStrokes[socket.id];
            io.emit('state', { strokes: sharedStrokes, bgColor: sharedBgColor });
        }
    });

    socket.on('clear', (data) => {
        sharedBgColor = data.bgColor;
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
        sharedStrokes.push({
            type: 'fill',
            x: data.x, y: data.y, width: data.width, height: data.height,
            color: data.color
        });
        io.emit('state', { strokes: sharedStrokes, bgColor: sharedBgColor });
    });

    socket.on('fillArea', (data) => {
        socket.broadcast.emit('fillArea', data);
    });

    socket.on('setBackground', (data) => {
        sharedBackground = data;  // Сохраняем фон
        socket.broadcast.emit('setBackground', data);  // Отправляем другому
    });

    socket.on('removeBackground', () => {
        socket.broadcast.emit('removeBackground');
    });

});

server.listen(3000, () => console.log('Сервер: http://localhost:3000'));