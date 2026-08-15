const { TOTAL_HEATS, HEAT_POINTS } = require('./track');
const { normalizeTrackId, getTrackEngine, registerCustomTrack, getDefaultTrackId } = require('./tracks-catalog');
const { PICKABLE_COLORS, PLAYER_COLORS } = require('./player-colors');

const SLOT_TEAMS = { 0: 'A', 1: 'A', 2: 'B', 3: 'B' };
const SLOT_KEYS = ['L Ctrl', 'V', 'R Ctrl', 'Num 0'];
const SPEED_LEVELS = [70, 80, 90, 100];

const BIKE = {
  length: 22,
  maxSpeed: 7.5,
  acceleration: 0.12,
  turnRate: 0.055,
  collisionSlowdown: 0.6,
};

function normalizeSpeedPercent(percent) {
  const allowed = [70, 80, 90, 100];
  const n = Number(percent);
  return allowed.includes(n) ? n : 100;
}

function maxSpeedFor(speedPercent) {
  return BIKE.maxSpeed * (normalizeSpeedPercent(speedPercent) / 100);
}

function createBike(x, y, angle, color, name, slot) {
  return {
    x, y, angle, speed: 0, color, name, slot,
    lap: 0, lapReady: false,
    finished: false, finishTime: null,
    fallen: false, fallTime: null,
    turning: false,
  };
}

function bikesCollide(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < 16;
}

function advanceBike(bike, trackEngine) {
  const dist = bike.speed;
  if (dist <= 0) return true;

  const steps = Math.max(1, Math.ceil(dist / 2.5));
  const step = dist / steps;
  const dx = Math.cos(bike.angle) * step;
  const dy = Math.sin(bike.angle) * step;

  for (let i = 0; i < steps; i++) {
    bike.x += dx;
    bike.y += dy;
    if (trackEngine.bikeHitsBarrier(bike.x, bike.y, bike.angle)) {
      bike.x -= dx;
      bike.y -= dy;
      return false;
    }
  }
  return true;
}

function pushBikeAway(bike, dx, dy, dist, trackEngine) {
  bike.x -= (dx / dist) * 2;
  bike.y -= (dy / dist) * 2;
  if (trackEngine.bikeHitsBarrier(bike.x, bike.y, bike.angle)) {
    bike.x += (dx / dist) * 2;
    bike.y += (dy / dist) * 2;
  }
}

function updateLap(bike, prevT, newT, trackEngine) {
  if (bike.finished || bike.fallen) return;
  const finishT = trackEngine.getFinishT();
  if (!bike.lapReady) {
    if (Math.abs(newT - finishT) > 0.05) bike.lapReady = true;
    return;
  }
  if (prevT < finishT && newT >= finishT && bike.speed > 1) {
    bike.lap += 1;
    if (bike.lap >= trackEngine.geometry.totalLaps) {
      bike.finished = true;
      bike.finishTime = Date.now();
    }
  }
}

function calcHeatPoints(bikes) {
  const finishers = bikes
    .filter((b) => b.finished && b.finishTime)
    .sort((a, b) => a.finishTime - b.finishTime);

  return bikes.map((b) => {
    if (b.fallen) {
      return { slot: b.slot, name: b.name, color: b.color, points: 0, label: 'u' };
    }
    const idx = finishers.findIndex((f) => f.slot === b.slot);
    if (idx === -1) {
      return { slot: b.slot, name: b.name, color: b.color, points: 0, label: 'u' };
    }
    return {
      slot: b.slot, name: b.name, color: b.color,
      points: HEAT_POINTS[idx] ?? 0,
      label: String(idx + 1),
    };
  });
}

function normalizeColor(color, slot) {
  if (typeof color === 'string' && PICKABLE_COLORS.includes(color)) return color;
  return PLAYER_COLORS[slot] ?? PICKABLE_COLORS[0];
}

class GameRoom {
  constructor(roomId) {
    this.id = roomId;
    this.mode = 'local';
    this.joinCode = null;
    /** @type {Map<string, {slot:number,name:string,team:string,color:string,speedPercent:number}>} */
    this.connections = new Map();
    /** @type {Map<string, {slot,name,team,color,speedPercent,sessionId,wasHost}>} */
    this.disconnectedSessions = new Map();
    this.hostId = null;
    this.clients = new Set();
    /** @type {Map<number, {slot, name, team, color, speedPercent, input}>} */
    this.riders = new Map();
    this.bikes = [];
    this.state = 'lobby';
    this.countdown = 0;
    this.heatNumber = 0;
    this.teamAName = 'Drużyna A';
    this.teamBName = 'Drużyna B';
    this.scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    this.teamScores = { A: 0, B: 0 };
    this.lastHeatResults = null;
    this.matchSummary = null;
    this.trackId = getDefaultTrackId();
    this.trackEngine = getTrackEngine(this.trackId);
    this.trackDefinition = null;
    this.trackBootstrapPending = false;
  }

  setHost(socketId) {
    this.hostId = socketId;
    const conn = this.connections.get(socketId);
    if (conn) conn.wasHost = true;
  }

  addClient(socketId) {
    this.clients.add(socketId);
    if (!this.hostId) this.hostId = socketId;
  }

  removeClient(socketId) {
    const conn = this.connections.get(socketId);
    const slot = conn?.slot ?? null;
    const wasHost = this.hostId === socketId;
    this.clients.delete(socketId);

    if (this.mode === 'online') {
      const inMatch = ['countdown', 'racing', 'heat_results'].includes(this.state);
      if (inMatch && conn?.sessionId) {
        this.disconnectedSessions.set(conn.sessionId, {
          slot: conn.slot,
          name: conn.name,
          team: conn.team,
          color: conn.color,
          speedPercent: conn.speedPercent,
          sessionId: conn.sessionId,
          wasHost,
        });
        this.connections.delete(socketId);
        if (slot != null) {
          const rider = this.riders.get(slot);
          if (rider) rider.input.turnLeft = false;
        }
      } else {
        this.connections.delete(socketId);
        if (this.state === 'lobby' || this.state === 'match_finished') {
          if (slot != null) this.riders.delete(slot);
          this.syncRidersFromConnections();
        }
      }
    }

    if (wasHost) {
      const [nextHost] = this.clients;
      this.hostId = nextHost || null;
    }
  }

  getUsedSlots() {
    const used = new Set();
    for (const c of this.connections.values()) used.add(c.slot);
    for (const c of this.disconnectedSessions.values()) used.add(c.slot);
    return used;
  }

  getSlotForSession(sessionId) {
    for (const c of this.connections.values()) {
      if (c.sessionId === sessionId) return c.slot;
    }
    const reserved = this.disconnectedSessions.get(sessionId);
    return reserved?.slot ?? null;
  }

  getSlotForSocket(socketId) {
    return this.connections.get(socketId)?.slot ?? null;
  }

  addOnlinePlayer(socketId, profile = {}) {
    if (this.mode !== 'online') return { ok: false, error: 'To nie jest pokój online.' };
    if (this.state !== 'lobby' && this.state !== 'match_finished') {
      return { ok: false, error: 'Mecz już trwa.' };
    }
    if (this.connections.has(socketId)) {
      return { ok: true, slot: this.connections.get(socketId).slot };
    }

    const activeCount = this.connections.size + this.disconnectedSessions.size;
    if (activeCount >= 4) return { ok: false, error: 'Pokój pełny (max 4 graczy).' };

    const team = profile.team === 'B' ? 'B' : 'A';
    const teamCount = [...this.connections.values(), ...this.disconnectedSessions.values()]
      .filter((c) => c.team === team).length;
    if (teamCount >= 2) return { ok: false, error: 'Max 2 graczy na drużynę.' };

    const usedSlots = this.getUsedSlots();
    let slot = -1;
    for (let i = 0; i < 4; i += 1) {
      if (!usedSlots.has(i)) { slot = i; break; }
    }
    if (slot < 0) return { ok: false, error: 'Brak wolnych slotów.' };

    const sessionId = String(profile.sessionId || '').slice(0, 64) || null;
    const name = String(profile.name || '').trim().slice(0, 16) || `Zawodnik ${slot + 1}`;
    const conn = {
      slot,
      name,
      team,
      color: normalizeColor(profile.color, slot),
      speedPercent: 100,
      sessionId,
      wasHost: false,
    };
    this.connections.set(socketId, conn);
    this.syncRidersFromConnections();
    return { ok: true, slot, sessionId };
  }

  rejoinOnlinePlayer(socketId, { joinCode, sessionId } = {}) {
    if (this.mode !== 'online') return { ok: false, error: 'To nie jest pokój online.' };
    const sid = String(sessionId || '').slice(0, 64);
    if (!sid) return { ok: false, error: 'Brak identyfikatora sesji.' };
    if (String(joinCode || '').trim().toUpperCase() !== this.joinCode) {
      return { ok: false, error: 'Nieprawidłowy kod pokoju.' };
    }

    const activeEntry = [...this.connections.entries()].find(([, c]) => c.sessionId === sid);
    if (activeEntry) {
      const [oldSocketId, active] = activeEntry;
      if (oldSocketId !== socketId) {
        this.clients.delete(oldSocketId);
        this.connections.delete(oldSocketId);
        this.connections.set(socketId, active);
      }
      if (active.wasHost) this.setHost(socketId);
      return { ok: true, slot: active.slot, sessionId: sid, reconnected: true };
    }

    const reserved = this.disconnectedSessions.get(sid);
    if (!reserved) {
      const inMatch = ['countdown', 'racing', 'heat_results'].includes(this.state);
      if (inMatch) {
        return { ok: false, error: 'Sesja wygasła. Poczekaj na koniec biegu i dołącz ponownie z kodem.' };
      }
      return { ok: false, error: 'Nie znaleziono twojej sesji. Dołącz do pokoju kodem.' };
    }

    this.disconnectedSessions.delete(sid);
    this.connections.set(socketId, {
      slot: reserved.slot,
      name: reserved.name,
      team: reserved.team,
      color: reserved.color,
      speedPercent: reserved.speedPercent,
      sessionId: sid,
      wasHost: reserved.wasHost,
    });
    if (reserved.wasHost) this.setHost(socketId);
    return { ok: true, slot: reserved.slot, sessionId: sid, reconnected: true };
  }

  updateOnlinePlayer(socketId, profile = {}) {
    const conn = this.connections.get(socketId);
    if (!conn) return { ok: false, error: 'Nie jesteś w pokoju.' };
    if (this.state !== 'lobby' && this.state !== 'match_finished') {
      return { ok: false, error: 'Nie można zmienić danych w trakcie meczu.' };
    }

    if (profile.name != null) {
      conn.name = String(profile.name).trim().slice(0, 16) || conn.name;
    }
    if (profile.team === 'A' || profile.team === 'B') {
      const otherTeamCount = [...this.connections.entries()]
        .filter(([sid, c]) => sid !== socketId && c.team === profile.team).length;
      if (otherTeamCount >= 2) return { ok: false, error: 'Max 2 graczy na drużynę.' };
      conn.team = profile.team;
    }
    if (profile.color != null) conn.color = normalizeColor(profile.color, conn.slot);
    this.syncRidersFromConnections();
    return { ok: true };
  }

  syncRidersFromConnections() {
    const riders = [...this.connections.values()].map((c) => ({
      slot: c.slot,
      name: c.name,
      team: c.team,
      color: c.color,
      speedPercent: c.speedPercent,
    }));
    return this.setupRiders(riders, this.teamAName, this.teamBName);
  }

  startOnlineMatch() {
    if (this.mode !== 'online') return false;
    if (!this.syncRidersFromConnections()) return false;
    return this.startMatch(getDefaultTrackId(), null);
  }

  hasClients() {
    return this.clients.size > 0;
  }

  canControl(socketId) {
    return this.hostId === socketId;
  }

  setTrack(trackId, trackDefinition = null) {
    if (trackDefinition) {
      registerCustomTrack(trackDefinition);
      this.trackId = trackDefinition.id;
      this.trackEngine = getTrackEngine(trackDefinition.id);
      this.trackDefinition = trackDefinition;
      this.trackBootstrapPending = true;
      return;
    }
    this.trackId = normalizeTrackId(trackId);
    this.trackEngine = getTrackEngine(this.trackId);
    this.trackDefinition = null;
    this.trackBootstrapPending = false;
  }

  consumeTrackBootstrap() {
    const pending = this.trackBootstrapPending;
    this.trackBootstrapPending = false;
    return pending;
  }

  /** riders: [{ slot: 0-3, name, team }] — tylko wypełnione sloty */
  setupRiders(riders, teamAName, teamBName) {
    if (this.state !== 'lobby' && this.state !== 'match_finished') return false;
    if (!riders.length) return false;

    const teamCount = { A: 0, B: 0 };
    for (const r of riders) {
      if (r.slot < 0 || r.slot > 3) return false;
      const team = r.team === 'B' ? 'B' : 'A';
      teamCount[team]++;
      if (teamCount[team] > 2) return false;
    }

    this.riders.clear();
    for (const r of riders) {
      const team = r.team === 'B' ? 'B' : 'A';
      const speedPercent = normalizeSpeedPercent(r.speedPercent);
      this.riders.set(r.slot, {
        slot: r.slot,
        name: r.name.slice(0, 16) || `Zawodnik ${r.slot + 1}`,
        team,
        color: r.color || PLAYER_COLORS[r.slot],
        speedPercent,
        input: { turnLeft: false },
      });
    }

    if (teamAName) this.teamAName = teamAName.slice(0, 24);
    if (teamBName) this.teamBName = teamBName.slice(0, 24);
    return true;
  }

  setInput(slot, turnLeft) {
    const rider = this.riders.get(slot);
    if (rider && this.state === 'racing') rider.input.turnLeft = !!turnLeft;
  }

  setSpeedLimit(slot, percent) {
    const rider = this.riders.get(slot);
    if (!rider) return false;
    rider.speedPercent = normalizeSpeedPercent(percent);
    const bike = this.bikes.find((b) => b.slot === slot);
    if (bike && !bike.fallen && !bike.finished) {
      const cap = maxSpeedFor(rider.speedPercent);
      if (bike.speed > cap) bike.speed = cap;
    }
    return true;
  }

  getRiderList() {
    return [...this.riders.values()].sort((a, b) => a.slot - b.slot);
  }

  startHeat() {
    const riders = this.getRiderList();
    const positions = this.trackEngine.getStartPositions(riders);
    const posBySlot = Object.fromEntries(positions.map((p) => [p.slot, p]));
    this.bikes = riders.map((r) => {
      const pos = posBySlot[r.slot];
      return createBike(pos.x, pos.y, pos.angle, r.color, r.name, r.slot);
    });
    for (const r of riders) r.input.turnLeft = false;
    this.state = 'countdown';
    this.countdown = 3;
    this.lastHeatResults = null;
  }

  startMatch(trackId, trackDefinition = null) {
    if (this.riders.size < 1) return false;
    if (this.state !== 'lobby' && this.state !== 'match_finished') return false;
    this.setTrack(trackId, trackDefinition);
    this.heatNumber = 1;
    this.scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    this.teamScores = { A: 0, B: 0 };
    this.matchSummary = null;
    this.startHeat();
    return true;
  }

  nextHeat() {
    if (this.state !== 'heat_results') return false;
    if (this.heatNumber >= TOTAL_HEATS) return false;
    this.heatNumber += 1;
    this.startHeat();
    return true;
  }

  tickCountdown() {
    this.countdown -= 1;
    if (this.countdown <= 0) this.state = 'racing';
  }

  tickPhysics() {
    if (this.state !== 'racing') return;

    const te = this.trackEngine;
    const prevT = this.bikes.map((b) => te.distanceToCenterline(b.x, b.y).t);

    for (let i = 0; i < this.bikes.length; i++) {
      const bike = this.bikes[i];
      if (bike.finished || bike.fallen) continue;

      const rider = this.riders.get(bike.slot);
      bike.turning = rider?.input.turnLeft || false;
      const speedCap = maxSpeedFor(rider?.speedPercent ?? 100);
      bike.speed = Math.min(speedCap, bike.speed + BIKE.acceleration);
      if (bike.turning) bike.angle -= BIKE.turnRate;

      if (!advanceBike(bike, te)) {
        bike.fallen = true;
        bike.fallTime = Date.now();
        bike.speed = 0;
        continue;
      }

      const { t } = te.distanceToCenterline(bike.x, bike.y);
      updateLap(bike, prevT[i], t, te);
    }

    for (let i = 0; i < this.bikes.length; i++) {
      for (let j = i + 1; j < this.bikes.length; j++) {
        const a = this.bikes[i];
        const b = this.bikes[j];
        if (a.fallen || b.fallen || a.finished || b.finished) continue;
        if (!bikesCollide(a, b)) continue;
        a.speed *= BIKE.collisionSlowdown;
        b.speed *= BIKE.collisionSlowdown;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        pushBikeAway(a, dx, dy, dist, te);
        pushBikeAway(b, -dx, -dy, dist, te);
      }
    }

    if (this.bikes.every((b) => b.finished || b.fallen)) this.finishHeat();
  }

  finishHeat() {
    const results = calcHeatPoints(this.bikes);
    this.lastHeatResults = results;

    for (const r of results) {
      this.scores[r.slot] = (this.scores[r.slot] || 0) + r.points;
    }
    this.teamScores.A = [0, 1].reduce((s, sl) => s + (this.scores[sl] || 0), 0);
    this.teamScores.B = [2, 3].reduce((s, sl) => s + (this.scores[sl] || 0), 0);

    if (this.heatNumber >= TOTAL_HEATS) {
      this.state = 'match_finished';
      const winner = this.teamScores.A > this.teamScores.B ? 'A'
        : this.teamScores.B > this.teamScores.A ? 'B' : 'draw';
      this.matchSummary = {
        teamA: { name: this.teamAName, points: this.teamScores.A },
        teamB: { name: this.teamBName, points: this.teamScores.B },
        winner,
        players: this.getRiderList().map((p) => ({
          name: p.name, slot: p.slot, team: p.team,
          color: p.color, totalPoints: this.scores[p.slot] || 0,
        })),
      };
    } else {
      this.state = 'heat_results';
    }
  }

  reset() {
    this.bikes = [];
    this.state = 'lobby';
    this.countdown = 0;
    this.heatNumber = 0;
    this.lastHeatResults = null;
    this.matchSummary = null;
    this.disconnectedSessions.clear();
    this.setTrack(getDefaultTrackId());
    this.scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    this.teamScores = { A: 0, B: 0 };
    for (const r of this.riders.values()) r.input.turnLeft = false;
    if (this.mode === 'online') this.syncRidersFromConnections();
  }

  fullReset() {
    this.riders.clear();
    this.disconnectedSessions.clear();
    this.reset();
    this.hostId = null;
    this.clients.clear();
  }

  getState(forSocketId = null, { includeTrackImages = false } = {}) {
    const mySlot = forSocketId ? this.getSlotForSocket(forSocketId) : null;
    const lobbyPlayers = this.mode === 'online'
      ? [
        ...[...this.connections.entries()].map(([socketId, c]) => ({
          socketId,
          slot: c.slot,
          name: c.name,
          team: c.team,
          color: c.color,
          connected: this.clients.has(socketId),
        })),
        ...[...this.disconnectedSessions.values()].map((c) => ({
          socketId: null,
          slot: c.slot,
          name: c.name,
          team: c.team,
          color: c.color,
          connected: false,
        })),
      ].sort((a, b) => a.slot - b.slot)
      : null;

    return {
      id: this.id,
      mode: this.mode,
      joinCode: this.joinCode,
      mySlot,
      lobbyPlayers,
      hostId: this.hostId,
      isHost: forSocketId ? this.hostId === forSocketId : false,
      state: this.state,
      countdown: this.countdown,
      totalLaps: this.trackEngine.geometry.totalLaps,
      totalHeats: TOTAL_HEATS,
      heatNumber: this.heatNumber,
      teamAName: this.teamAName,
      teamBName: this.teamBName,
      teamScores: this.teamScores,
      scores: this.scores,
      lastHeatResults: this.lastHeatResults,
      matchSummary: this.matchSummary,
      trackId: this.trackId,
      trackDefinition: includeTrackImages ? this.trackDefinition : null,
      canNextHeat: this.state === 'heat_results' && this.heatNumber < TOTAL_HEATS,
      players: this.getRiderList().map((p) => ({
        name: p.name,
        slot: p.slot,
        team: p.team,
        color: p.color,
        key: SLOT_KEYS[p.slot],
        speedPercent: p.speedPercent,
        totalPoints: this.scores[p.slot] || 0,
      })),
      bikes: this.bikes.map((b) => ({
        x: Math.round(b.x * 10) / 10,
        y: Math.round(b.y * 10) / 10,
        angle: Math.round(b.angle * 1000) / 1000,
        speed: Math.round(b.speed * 10) / 10,
        speedPercent: this.riders.get(b.slot)?.speedPercent ?? 100,
        color: b.color,
        name: b.name,
        slot: b.slot,
        lap: b.lap,
        finished: b.finished,
        fallen: b.fallen,
        turning: b.turning,
      })),
    };
  }
}

class GameManager {
  constructor() {
    this.rooms = new Map();
    this.roomsByCode = new Map();
  }

  getOrCreateRoom(id) {
    if (!this.rooms.has(id)) this.rooms.set(id, new GameRoom(id));
    return this.rooms.get(id);
  }

  createOnlineRoom(hostSocketId) {
    const { generateJoinCode } = require('./room-codes');
    let code = '';
    do { code = generateJoinCode(); } while (this.roomsByCode.has(code));
    const id = `room-${code}`;
    const room = new GameRoom(id);
    room.mode = 'online';
    room.joinCode = code;
    room.addClient(hostSocketId);
    room.setHost(hostSocketId);
    this.rooms.set(id, room);
    this.roomsByCode.set(code, id);
    return room;
  }

  findRoomByCode(joinCode) {
    const code = String(joinCode || '').trim().toUpperCase();
    const id = this.roomsByCode.get(code);
    return id ? this.rooms.get(id) : null;
  }

  removeRoom(id) {
    const room = this.rooms.get(id);
    if (room?.joinCode) this.roomsByCode.delete(room.joinCode);
    this.rooms.delete(id);
  }
}

module.exports = {
  GameManager,
  GameRoom,
  BIKE,
  PLAYER_COLORS,
  PICKABLE_COLORS,
  SLOT_KEYS,
  TOTAL_HEATS,
};
