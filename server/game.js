const {
  TRACK,
  TOTAL_HEATS,
  HEAT_POINTS,
  distanceToCenterline,
  bikeHitsBarrier,
  getStartPositions,
  getFinishT,
} = require('./track');

const SLOT_TEAMS = { 0: 'A', 1: 'A', 2: 'B', 3: 'B' };
const PLAYER_COLORS = { 0: '#e63946', 1: '#457b9d', 2: '#2a9d8f', 3: '#e9c46a' };
const SLOT_KEYS = ['A', 'S', 'K', 'L'];

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

class GameRoom {
  constructor(roomId) {
    this.id = roomId;
    this.hostId = null;
    /** @type {Map<number, {slot, name, team, color, input}>} */
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
  }

  setHost(socketId) {
    this.hostId = socketId;
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
      this.riders.set(r.slot, {
        slot: r.slot,
        name: r.name.slice(0, 16) || `Zawodnik ${r.slot + 1}`,
        team,
        color: PLAYER_COLORS[r.slot],
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

  getRiderList() {
    return [...this.riders.values()].sort((a, b) => a.slot - b.slot);
  }

  startHeat() {
    const riders = this.getRiderList();
    const positions = getStartPositions(riders);
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

  startMatch() {
    if (this.riders.size < 1) return false;
    if (this.state !== 'lobby' && this.state !== 'match_finished') return false;
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

      const rider = this.riders.get(bike.slot);
      bike.turning = rider?.input.turnLeft || false;
      bike.speed = Math.min(BIKE.maxSpeed, bike.speed + BIKE.acceleration);
      if (bike.turning) bike.angle -= BIKE.turnRate;

      bike.x += Math.cos(bike.angle) * bike.speed;
      bike.y += Math.sin(bike.angle) * bike.speed;

      if (bikeHitsBarrier(bike.x, bike.y, bike.angle)) {
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
    this.scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    this.teamScores = { A: 0, B: 0 };
    for (const r of this.riders.values()) r.input.turnLeft = false;
  }

  fullReset() {
    this.riders.clear();
    this.reset();
    this.hostId = null;
  }

  getState() {
    return {
      id: this.id,
      state: this.state,
      countdown: this.countdown,
      totalLaps: TRACK.totalLaps,
      totalHeats: TOTAL_HEATS,
      heatNumber: this.heatNumber,
      teamAName: this.teamAName,
      teamBName: this.teamBName,
      teamScores: this.teamScores,
      scores: this.scores,
      lastHeatResults: this.lastHeatResults,
      matchSummary: this.matchSummary,
      canNextHeat: this.state === 'heat_results' && this.heatNumber < TOTAL_HEATS,
      players: this.getRiderList().map((p) => ({
        name: p.name,
        slot: p.slot,
        team: p.team,
        color: p.color,
        key: SLOT_KEYS[p.slot],
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

module.exports = { GameManager, BIKE, PLAYER_COLORS, SLOT_KEYS, TOTAL_HEATS };
