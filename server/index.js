const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { GameManager } = require('./game');
const { isValidTrackId, registerCustomTrack, reloadCatalog, getDefaultTrackId, TRACK_META } = require('./tracks-catalog');
const { getTopEntries } = require('./leaderboard');
const { recordEvent } = require('./analytics');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 60;
const COUNTDOWN_TICK = 60;
const RACING_EMIT_EVERY = 3;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const gameManager = new GameManager();

app.use(express.json({ limit: '8kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_req, res) => res.json({ status: 'ok', rooms: gameManager.rooms.size }));

app.post('/api/events', (req, res) => {
  const { event, props } = req.body || {};
  if (!recordEvent({ event, props })) {
    res.status(400).json({ ok: false, error: 'Unknown event' });
    return;
  }
  res.json({ ok: true });
});

app.get('/api/leaderboard', (req, res) => {
  const trackId = isValidTrackId(req.query.track) ? req.query.track : getDefaultTrackId();
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  res.json({
    trackId,
    trackName: TRACK_META[trackId]?.name || trackId,
    entries: getTopEntries(trackId, limit),
  });
});

function getSocketRoom(socket) {
  const roomId = socket.data?.roomId;
  return roomId ? gameManager.rooms.get(roomId) : null;
}

function leaveSocketRoom(socket) {
  const room = getSocketRoom(socket);
  if (!room) return null;
  room.removeClient(socket.id);
  socket.leave(room.id);
  socket.data.roomId = null;
  if (!room.hasClients()) {
    const keepAlive = room.mode === 'online' && room.disconnectedSessions.size > 0;
    if (!keepAlive) {
      room.fullReset();
      gameManager.removeRoom(room.id);
      return null;
    }
  }
  return room;
}

function emitState(room) {
  const includeTrackImages = room.consumeTrackBootstrap();
  for (const socketId of room.clients) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock) sock.emit('state', room.getState(socketId, { includeTrackImages }));
  }
}

function denyUnlessHost(socket, room) {
  if (room.canControl(socket.id)) return true;
  socket.emit('error', { message: 'Tylko host może wykonać tę akcję.' });
  return false;
}

io.on('connection', (socket) => {
  socket.data.roomId = null;

  socket.on('join-local', () => {
    leaveSocketRoom(socket);
    const room = gameManager.getOrCreateRoom('main');
    room.mode = 'local';
    room.addClient(socket.id);
    socket.join('main');
    socket.data.roomId = 'main';
    socket.emit('state', room.getState(socket.id));
  });

  socket.on('list-rooms', () => {
    socket.emit('room-list', { rooms: gameManager.listPublicRooms() });
  });

  socket.on('create-room', (profile = {}) => {
    reloadCatalog();
    leaveSocketRoom(socket);
    const room = gameManager.createOnlineRoom(socket.id);
    socket.join(room.id);
    socket.data.roomId = room.id;
    const result = room.addOnlinePlayer(socket.id, profile);
    if (!result.ok) {
      socket.emit('error', { message: result.error });
      return;
    }
    room.setHost(socket.id);
    socket.emit('room-ready', {
      joinCode: room.joinCode,
      roomId: room.id,
      slot: result.slot,
      sessionId: result.sessionId || profile.sessionId || null,
    });
    emitState(room);
  });

  socket.on('join-room', ({ joinCode, ...profile } = {}) => {
    const room = gameManager.findRoomByCode(joinCode);
    if (!room) {
      socket.emit('error', { message: 'Nie znaleziono pokoju o podanym kodzie.' });
      return;
    }
    leaveSocketRoom(socket);
    room.addClient(socket.id);
    socket.join(room.id);
    socket.data.roomId = room.id;
    const result = room.addOnlinePlayer(socket.id, profile);
    if (!result.ok) {
      room.removeClient(socket.id);
      socket.leave(room.id);
      socket.data.roomId = null;
      socket.emit('error', { message: result.error });
      return;
    }
    socket.emit('room-ready', {
      joinCode: room.joinCode,
      roomId: room.id,
      slot: result.slot,
      sessionId: result.sessionId || profile.sessionId || null,
    });
    emitState(room);
  });

  socket.on('rejoin-room', ({ joinCode, sessionId } = {}) => {
    const room = gameManager.findRoomByCode(joinCode);
    if (!room) {
      socket.emit('error', { message: 'Nie znaleziono pokoju o podanym kodzie.' });
      return;
    }
    leaveSocketRoom(socket);
    room.addClient(socket.id);
    socket.join(room.id);
    socket.data.roomId = room.id;
    const result = room.rejoinOnlinePlayer(socket.id, { joinCode, sessionId });
    if (!result.ok) {
      room.removeClient(socket.id);
      socket.leave(room.id);
      socket.data.roomId = null;
      socket.emit('error', { message: result.error });
      return;
    }
    socket.emit('room-ready', {
      joinCode: room.joinCode,
      roomId: room.id,
      slot: result.slot,
      sessionId: result.sessionId,
      reconnected: true,
    });
    emitState(room);
  });

  socket.on('update-profile', (profile = {}) => {
    const room = getSocketRoom(socket);
    if (!room || room.mode !== 'online') return;
    const result = room.updateOnlinePlayer(socket.id, profile);
    if (!result.ok) {
      socket.emit('error', { message: result.error });
      return;
    }
    emitState(room);
  });

  socket.on('set-lobby-ready', ({ ready } = {}) => {
    const room = getSocketRoom(socket);
    if (!room || room.mode !== 'online') return;
    const result = room.setLobbyReady(socket.id, !!ready);
    if (!result.ok) {
      socket.emit('error', { message: result.error });
      return;
    }
    emitState(room);
  });

  socket.on('set-team-names', ({ teamA, teamB } = {}) => {
    const room = getSocketRoom(socket);
    if (!room || room.mode !== 'online') return;
    if (!denyUnlessHost(socket, room)) return;
    const result = room.setTeamNames(socket.id, { teamA, teamB });
    if (!result.ok) {
      socket.emit('error', { message: result.error });
      return;
    }
    emitState(room);
  });

  socket.on('kick-player', ({ slot } = {}) => {
    const room = getSocketRoom(socket);
    if (!room || room.mode !== 'online') return;
    if (!denyUnlessHost(socket, room)) return;
    const result = room.kickPlayer(socket.id, slot);
    if (!result.ok) {
      socket.emit('error', { message: result.error });
      return;
    }
    const target = io.sockets.sockets.get(result.targetSocketId);
    if (target) {
      target.emit('kicked', { message: 'Host wyrzucił cię z pokoju.' });
      target.leave(room.id);
      target.data.roomId = null;
    }
    emitState(room);
  });

  socket.on('leave-room', () => {
    const room = leaveSocketRoom(socket);
    socket.emit('room-left');
    if (room) emitState(room);
  });

  socket.on('start-match', ({ riders, teamA, teamB, trackId, trackDefinition } = {}) => {
    reloadCatalog();
    const room = getSocketRoom(socket);
    if (!room) {
      socket.emit('error', { message: 'Nie jesteś w pokoju gry.' });
      return;
    }
    if (room.state !== 'lobby' && room.state !== 'match_finished') {
      socket.emit('error', { message: 'Mecz już trwa.' });
      return;
    }

    if (room.mode === 'online') {
      if (!denyUnlessHost(socket, room)) return;
      if (!room.startOnlineMatch()) {
        socket.emit('error', { message: 'Wszyscy gracze muszą być gotowi (drużyna, kolor, przycisk Gotowy).' });
        return;
      }
      emitState(room);
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
    if (room.startMatch(trackId || getDefaultTrackId(), trackDefinition || null)) emitState(room);
    else socket.emit('error', { message: 'Nie można rozpocząć meczu.' });
  });

  socket.on('next-heat', () => {
    const room = getSocketRoom(socket);
    if (!room || !denyUnlessHost(socket, room)) return;
    if (room.nextHeat()) emitState(room);
  });

  socket.on('input', (payload = {}) => {
    const room = getSocketRoom(socket);
    if (!room) return;
    const slot = room.mode === 'online' ? room.getSlotForSocket(socket.id) : payload.slot;
    if (slot == null) return;
    room.setInput(slot, payload.turnLeft);
  });

  socket.on('speed-limit', (payload = {}) => {
    const room = getSocketRoom(socket);
    if (!room) return;
    const slot = room.mode === 'online' ? room.getSlotForSocket(socket.id) : payload.slot;
    if (slot == null) return;
    if (room.mode === 'online') {
      const conn = room.connections.get(socket.id);
      if (conn) conn.speedPercent = payload.percent;
    }
    if (!room.setSpeedLimit(slot, payload.percent)) return;
    // Podczas wyścigu stan i tak leci z pętli fizyki — unikamy pętli sprzężenia z klientów.
    if (room.state === 'lobby' || room.state === 'match_finished') emitState(room);
  });

  socket.on('reset', () => {
    const room = getSocketRoom(socket);
    if (!room || !denyUnlessHost(socket, room)) return;
    room.reset();
    emitState(room);
  });

  socket.on('disconnect', () => {
    const room = leaveSocketRoom(socket);
    if (room) emitState(room);
  });
});

setInterval(() => {
  for (const room of gameManager.rooms.values()) {
    if (room.state === 'countdown') {
      room._countdownTicks = (room._countdownTicks || 0) + 1;
      if (room._countdownTicks >= COUNTDOWN_TICK) {
        room._countdownTicks = 0;
        room.tickCountdown();
        emitState(room);
      }
    } else if (room.state === 'racing') {
      room.tickPhysics();
      room._racingEmitTicks = (room._racingEmitTicks || 0) + 1;
      const heatEnded = room.state !== 'racing';
      if (heatEnded || room._racingEmitTicks >= RACING_EMIT_EVERY) {
        room._racingEmitTicks = 0;
        emitState(room);
      }
    }
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => console.log(`Żużel — serwer gry na porcie ${PORT}`));
