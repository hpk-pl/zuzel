const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { GameManager } = require('./game');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 60;
const COUNTDOWN_TICK = 60;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const gameManager = new GameManager();

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_req, res) => res.json({ status: 'ok', rooms: gameManager.rooms.size }));

function emitState(room) {
  for (const socketId of room.clients) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.emit('state', room.getState(socketId));
  }
}

function denyUnlessHost(socket, room) {
  if (room.canControl(socket.id)) return true;
  socket.emit('error', { message: 'Tylko host może wykonać tę akcję. Odśwież stronę (F5), aby zostać hostem.' });
  return false;
}

io.on('connection', (socket) => {
  const room = gameManager.getOrCreateRoom('main');
  room.addClient(socket.id);
  socket.join('main');
  socket.emit('state', room.getState(socket.id));

  socket.on('start-match', ({ riders, teamA, teamB }) => {
    if (room.state !== 'lobby' && room.state !== 'match_finished') {
      socket.emit('error', { message: 'Mecz już trwa.' });
      return;
    }
    if (!room.setupRiders(riders || [], teamA, teamB)) {
      socket.emit('error', { message: 'Ustaw co najmniej 1 zawodnika (max 2 na drużynę).' });
      return;
    }
    if (room.startMatch()) emitState(room);
    else socket.emit('error', { message: 'Nie można rozpocząć meczu.' });
  });

  socket.on('next-heat', () => {
    if (!denyUnlessHost(socket, room)) return;
    if (room.nextHeat()) emitState(room);
  });

  socket.on('input', ({ slot, turnLeft }) => {
    room.setInput(slot, turnLeft);
  });

  socket.on('reset', () => {
    if (!denyUnlessHost(socket, room)) return;
    room.reset();
    emitState(room);
  });

  socket.on('disconnect', () => {
    room.removeClient(socket.id);
    if (!room.hasClients()) {
      room.fullReset();
      gameManager.removeRoom('main');
      return;
    }
    emitState(room);
  });
});

let countdownCounter = 0;
setInterval(() => {
  for (const room of gameManager.rooms.values()) {
    if (room.state === 'countdown') {
      countdownCounter += 1;
      if (countdownCounter >= COUNTDOWN_TICK) {
        countdownCounter = 0;
        room.tickCountdown();
        emitState(room);
      }
    } else if (room.state === 'racing') {
      room.tickPhysics();
      emitState(room);
    }
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => console.log(`Żużel — serwer gry na porcie ${PORT}`));
