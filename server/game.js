const {
  TRACK,
  TOTAL_HEATS,
  HEAT_POINTS,
  distanceToCenterline,
  hasHitBarrier,
  getStartPositions,
  getFinishT,
} = require('./track');

const TEAM_A_SLOTS = [0, 1];
const TEAM_B_SLOTS = [2, 3];
const PLAYER_COLORS = { 0: '#e63946', 1: '#457b9d', 2: '#2a9d8f', 3: '#e9c46a' };

const BIKE = {
  length: 22,
  maxSpeed: 7.5,
  acceleration: 0.12,
  turnRate: 0.055,
  collisionSlowdown: 0.6,
};

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

function updateLap(bike, prevT, newT) {
  if (bike.finished || bike.fallen) return;
  const finishT = getFinishT();
  if (!bike.lapReady) {
    if (Math.abs(newT - finishT) > 0.05) bike.lapReady = true;
    return;
  }
  if (prevT < finishT && newT >= finishT && bike.speed > 1) {
    bike.lap += 1;
    if (bike.lap >= TRACK.totalLaps) {
      bike.finished = true;
      bike.finishTime = Date.now();
    }
  }
}

function calcHeatPoints(bikes) {
  const finishers = bikes
    .filter((b) => b.finished && b.finishTime)
    .sort((a, b) => a.finishTime - b.finishTime);

  const results = bikes.map((b) => {
    if (b.fallen) {
      return { slot: b.slot, name: b.name, color: b.color, points: 0, label: 'u', place: null };
    }
    const idx = finishers.findIndex((f) => f.slot === b.slot);
    if (idx === -1) {
      return { slot: b.slot, name: b.name, color: b.color, points: 0, label: 'u', place: null };
    }
    const place = idx + 1;
    return {
      slot: b.slot, name: b.name, color: b.color,
      points: HEAT_POINTS[idx] ?? 0,
      label: String(place),
      place,
    };
  });
  return results;
}

class GameRoom {
  constructor(roomId) {
    this.id = roomId;
    this.players = new Map();
    this.bikes = [];
    this.state = 'lobby';
    this.countdown = 0;
    this.hostId = null;
    this.heatNumber = 0;
    this.teamAName = 'Drużyna A';
    this.teamBName = 'Drużyna B';
    this.scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    this.teamScores = { A: 0, B: 0 };
    this.lastHeatResults = null;
    this.matchSummary = null;
  }

  addPlayer(id, name, team) {
    if (this.state !== 'lobby') return false;
    if (this.players.size >= 4) return false;

    const wantTeam = team === 'B' ? 'B' : 'A';
    const teamSlots = wantTeam === 'A' ? TEAM_A_SLOTS : TEAM_B_SLOTS;
    const taken = [...this.players.values()].map((p) => p.slot);
    const freeSlot = teamSlots.find((s) => !taken.includes(s));
    if (freeSlot === undefined) return false;

    if (this.players.size === 0) this.hostId = id;

    this.players.set(id, {
      id,
      name: name || `Zawodnik ${freeSlot + 1}`,
      slot: freeSlot,
      team: wantTeam,
      color: PLAYER_COLORS[freeSlot],
      ready: false,
      input: { turnLeft: false },
    });
    return true;
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.players.keys().next().value || null;
    if (this.players.size === 0) this.reset();
    else if (this.state !== 'lobby' && this.state !== 'match_finished') this.reset();
  }

  setTeamNames(teamA, teamB) {
    if (teamA) this.teamAName = teamA.slice(0, 24);
    if (teamB) this.teamBName = teamB.slice(0, 24);
  }

  setReady(id, ready) {
    const p = this.players.get(id);
    if (p) p.ready = ready;
  }

  setInput(id, turnLeft) {
    const p = this.players.get(id);
    if (p && this.state === 'racing') p.input.turnLeft = !!turnLeft;
  }

  canStartMatch() {
    if (this.players.size < 1) return false;
    return [...this.players.values()].every((p) => p.ready);
  }

  startHeat() {
    const positions = getStartPositions(this.players.size);
    this.bikes = [];
    let i = 0;
    for (const p of this.players.values()) {
      const pos = positions[i++];
      this.bikes.push(createBike(pos.x, pos.y, pos.angle, p.color, p.name, p.slot));
    }
    this.state = 'countdown';
    this.countdown = 3;
    this.lastHeatResults = null;
  }

  startMatch() {
    if (!this.canStartMatch()) return false;
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

    const prevT = this.bikes.map((b) => distanceToCenterline(b.x, b.y).t);

    for (let i = 0; i < this.bikes.length; i++) {
      const bike = this.bikes[i];
      if (bike.finished || bike.fallen) continue;

      const player = [...this.players.values()].find((p) => p.slot === bike.slot);
      bike.turning = player?.input.turnLeft || false;
      bike.speed = Math.min(BIKE.maxSpeed, bike.speed + BIKE.acceleration);
      if (bike.turning) bike.angle -= BIKE.turnRate;

      bike.x += Math.cos(bike.angle) * bike.speed;
      bike.y += Math.sin(bike.angle) * bike.speed;

      if (hasHitBarrier(bike.x, bike.y)) {
        bike.fallen = true;
        bike.fallTime = Date.now();
        bike.speed = 0;
        continue;
      }

      const { t } = distanceToCenterline(bike.x, bike.y);
      updateLap(bike, prevT[i], t);
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
        a.x -= (dx / dist) * 2;
        a.y -= (dy / dist) * 2;
        b.x += (dx / dist) * 2;
        b.y += (dy / dist) * 2;
      }
    }

    const active = this.bikes.filter((b) => !b.finished && !b.fallen);
    if (active.length === 0) this.finishHeat();
  }

  finishHeat() {
    const results = calcHeatPoints(this.bikes);
    this.lastHeatResults = results;

    for (const r of results) {
      this.scores[r.slot] = (this.scores[r.slot] || 0) + r.points;
    }
    this.teamScores.A = TEAM_A_SLOTS.reduce((s, sl) => s + (this.scores[sl] || 0), 0);
    this.teamScores.B = TEAM_B_SLOTS.reduce((s, sl) => s + (this.scores[sl] || 0), 0);

    if (this.heatNumber >= TOTAL_HEATS) {
      this.state = 'match_finished';
      const winner = this.teamScores.A > this.teamScores.B ? 'A'
        : this.teamScores.B > this.teamScores.A ? 'B' : 'draw';
      this.matchSummary = {
        teamA: { name: this.teamAName, points: this.teamScores.A },
        teamB: { name: this.teamBName, points: this.teamScores.B },
        winner,
        players: [...this.players.values()].map((p) => ({
          name: p.name,
          slot: p.slot,
          team: p.team,
          color: p.color,
          totalPoints: this.scores[p.slot] || 0,
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
    this.scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    this.teamScores = { A: 0, B: 0 };
    for (const p of this.players.values()) {
      p.ready = false;
      p.input.turnLeft = false;
    }
  }

  getState() {
    return {
      id: this.id,
      state: this.state,
      countdown: this.countdown,
      totalLaps: TRACK.totalLaps,
      totalHeats: TOTAL_HEATS,
      heatNumber: this.heatNumber,
      hostId: this.hostId,
      teamAName: this.teamAName,
      teamBName: this.teamBName,
      teamScores: this.teamScores,
      scores: this.scores,
      lastHeatResults: this.lastHeatResults,
      matchSummary: this.matchSummary,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        team: p.team,
        color: p.color,
        ready: p.ready,
        totalPoints: this.scores[p.slot] || 0,
      })),
      bikes: this.bikes.map((b) => ({
        x: Math.round(b.x * 10) / 10,
        y: Math.round(b.y * 10) / 10,
        angle: Math.round(b.angle * 1000) / 1000,
        speed: Math.round(b.speed * 10) / 10,
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
  constructor() { this.rooms = new Map(); }
  getOrCreateRoom(id) {
    if (!this.rooms.has(id)) this.rooms.set(id, new GameRoom(id));
    return this.rooms.get(id);
  }
  removeRoom(id) { this.rooms.delete(id); }
}

module.exports = { GameManager, BIKE, PLAYER_COLORS, TOTAL_HEATS };
