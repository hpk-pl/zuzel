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

io.on('connection', (socket) => {
  const room = gameManager.getOrCreateRoom('main');
  room.setHost(socket.id);
  socket.join('main');
  socket.emit('state', room.getState());

  socket.on('start-match', ({ riders, teamA, teamB }) => {
    if (room.hostId !== socket.id) return;
    if (!room.setupRiders(riders || [], teamA, teamB)) {
      socket.emit('error', { message: 'Ustaw co najmniej 1 zawodnika (max 2 na drużynę).' });
      return;
    }
    if (room.startMatch()) io.to('main').emit('state', room.getState());
    else socket.emit('error', { message: 'Nie można rozpocząć meczu.' });
  });

  socket.on('next-heat', () => {
    if (room.hostId !== socket.id) return;
    if (room.nextHeat()) io.to('main').emit('state', room.getState());
  });

  socket.on('input', ({ slot, turnLeft }) => {
    room.setInput(slot, turnLeft);
  });

  socket.on('reset', () => {
    if (room.hostId !== socket.id) return;
    room.reset();
    io.to('main').emit('state', room.getState());
  });

  socket.on('disconnect', () => {
    if (room.hostId === socket.id) {
      room.fullReset();
      gameManager.removeRoom('main');
    }
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
        io.to(room.id).emit('state', room.getState());
      }
    } else if (room.state === 'racing') {
      room.tickPhysics();
      io.to(room.id).emit('state', room.getState());
    }
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => console.log(`Żużel — serwer gry na porcie ${PORT}`));
