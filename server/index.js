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
const io = new Server(server, {
  cors: { origin: '*' },
});

const gameManager = new GameManager();

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: gameManager.rooms.size });
});

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join', ({ roomId, name }) => {
    const id = (roomId || 'main').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'main';
    const room = gameManager.getOrCreateRoom(id);

    if (!room.addPlayer(socket.id, name)) {
      socket.emit('error', { message: 'Pokój pełny lub gra już trwa.' });
      return;
    }

    currentRoom = room;
    socket.join(id);
    io.to(id).emit('state', room.getState());
  });

  socket.on('ready', (ready) => {
    if (!currentRoom) return;
    currentRoom.setReady(socket.id, ready);
    io.to(currentRoom.id).emit('state', currentRoom.getState());
  });

  socket.on('start', () => {
    if (!currentRoom) return;
    if (currentRoom.hostId !== socket.id) return;
    if (currentRoom.startRace()) {
      io.to(currentRoom.id).emit('state', currentRoom.getState());
    }
  });

  socket.on('input', ({ turnLeft }) => {
    if (!currentRoom) return;
    currentRoom.setInput(socket.id, turnLeft);
  });

  socket.on('reset', () => {
    if (!currentRoom) return;
    if (currentRoom.hostId !== socket.id) return;
    currentRoom.reset();
    io.to(currentRoom.id).emit('state', currentRoom.getState());
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    currentRoom.removePlayer(socket.id);
    if (currentRoom.players.size === 0) {
      gameManager.removeRoom(currentRoom.id);
    } else {
      io.to(currentRoom.id).emit('state', currentRoom.getState());
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

server.listen(PORT, () => {
  console.log(`Żużel — serwer gry na porcie ${PORT}`);
});
