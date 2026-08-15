const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { GameManager } = require('./game');
const { isValidTrackId, registerCustomTrack, reloadCatalog } = require('./tracks-catalog');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 60;
const COUNTDOWN_TICK = 60;
const RACING_EMIT_EVERY = 2; // fizyka 60 Hz, stan do klienta 30 Hz

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const gameManager = new GameManager();

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_req, res) => res.json({ status: 'ok', rooms: gameManager.rooms.size }));

function emitState(room) {
  const includeTrackImages = room.consumeTrackBootstrap();
  for (const socketId of room.clients) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.emit('state', room.getState(socketId, { includeTrackImages }));
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

  socket.on('start-match', ({ riders, teamA, teamB, trackId, trackDefinition }) => {
    reloadCatalog();
    if (room.state !== 'lobby' && room.state !== 'match_finished') {
      socket.emit('error', { message: 'Mecz już trwa.' });
      return;
    }
    if (trackDefinition) {
      if (!trackDefinition.id || !trackDefinition.geometry) {
        socket.emit('error', { message: 'Nieprawidłowa definicja własnego toru.' });
        return;
      }
      registerCustomTrack(trackDefinition);
    } else if (trackId && !isValidTrackId(trackId)) {
      socket.emit('error', { message: 'Nieznany tor.' });
      return;
    }
    if (!room.setupRiders(riders || [], teamA, teamB)) {
      socket.emit('error', { message: 'Ustaw co najmniej 1 zawodnika (max 2 na drużynę).' });
      return;
    }
    if (room.startMatch(trackId, trackDefinition || null)) emitState(room);
    else socket.emit('error', { message: 'Nie można rozpocząć meczu.' });
  });

  socket.on('next-heat', () => {
    if (!denyUnlessHost(socket, room)) return;
    if (room.nextHeat()) emitState(room);
  });

  socket.on('input', ({ slot, turnLeft }) => {
    room.setInput(slot, turnLeft);
  });

  socket.on('speed-limit', ({ slot, percent }) => {
    if (room.setSpeedLimit(slot, percent)) emitState(room);
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
let racingEmitCounter = 0;
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
      racingEmitCounter += 1;
      const heatEnded = room.state !== 'racing';
      if (heatEnded || racingEmitCounter >= RACING_EMIT_EVERY) {
        racingEmitCounter = 0;
        emitState(room);
      }
    }
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => console.log(`Żużel — serwer gry na porcie ${PORT}`));
