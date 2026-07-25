const {
  TRACK,
  distanceToCenterline,
  hasHitBarrier,
  getStartPositions,
  getFinishT,
} = require('./track');

const PLAYER_COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a'];
const PLAYER_NAMES = ['Czerwony', 'Niebieski', 'Zielony', 'Żółty'];

const BIKE = {
  length: 22,
  maxSpeed: 7.5,
  minSpeed: 2.0,
  acceleration: 0.12,
  turnRate: 0.055,
  collisionSlowdown: 0.6,
  width: 6,
};

function createBike(x, y, angle, color, name, slot) {
  return {
    x,
    y,
    angle,
    speed: 0,
    color,
    name,
    slot,
    lap: 0,
    lastT: 0,
    lapReady: false,
    finished: false,
    finishTime: null,
    fallen: false,
    fallTime: null,
    turning: false,
  };
}

function bikeEndpoints(bike) {
  const hx = Math.cos(bike.angle) * BIKE.length * 0.5;
  const hy = Math.sin(bike.angle) * BIKE.length * 0.5;
  return {
    front: { x: bike.x + hx, y: bike.y + hy },
    back: { x: bike.x - hx, y: bike.y - hy },
  };
}

function bikesCollide(a, b) {
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  return dist < BIKE.length * 0.7;
}

function updateLap(bike, prevT, newT) {
  if (bike.finished || bike.fallen) return;

  const finishT = getFinishT();

  if (!bike.lapReady) {
    if (Math.abs(newT - finishT) > 0.05) bike.lapReady = true;
    return;
  }

  const crossed = prevT < finishT && newT >= finishT && bike.speed > 1;

  if (crossed) {
    bike.lap += 1;
    if (bike.lap >= TRACK.totalLaps) {
      bike.finished = true;
      bike.finishTime = Date.now();
    }
  }
}

class GameRoom {
  constructor(roomId) {
    this.id = roomId;
    this.players = new Map();
    this.bikes = [];
    this.state = 'lobby';
    this.countdown = 0;
    this.raceStartTime = null;
    this.winner = null;
    this.hostId = null;
  }

  addPlayer(id, name) {
    if (this.players.size >= 4) return false;
    if (this.state !== 'lobby') return false;

    const slot = this.players.size;
    if (slot === 0) this.hostId = id;

    this.players.set(id, {
      id,
      name: name || PLAYER_NAMES[slot],
      slot,
      color: PLAYER_COLORS[slot],
      ready: false,
      input: { turnLeft: false },
    });
    return true;
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.hostId === id) {
      this.hostId = this.players.keys().next().value || null;
    }
    if (this.players.size === 0) {
      this.reset();
    } else if (this.state !== 'lobby') {
      this.reset();
    }
  }

  setReady(id, ready) {
    const p = this.players.get(id);
    if (p) p.ready = ready;
  }

  setInput(id, turnLeft) {
    const p = this.players.get(id);
    if (p && this.state === 'racing') {
      p.input.turnLeft = !!turnLeft;
    }
  }

  canStart() {
    if (this.players.size < 1) return false;
    return [...this.players.values()].every((p) => p.ready);
  }

  startRace() {
    if (!this.canStart()) return false;

    const positions = getStartPositions(this.players.size);
    this.bikes = [];
    let i = 0;
    for (const p of this.players.values()) {
      const pos = positions[i];
      this.bikes.push(
        createBike(pos.x, pos.y, pos.angle, p.color, p.name, p.slot)
      );
      i++;
    }

    this.state = 'countdown';
    this.countdown = 3;
    this.winner = null;
    return true;
  }

  tickCountdown() {
    this.countdown -= 1;
    if (this.countdown <= 0) {
      this.state = 'racing';
      this.raceStartTime = Date.now();
    }
  }

  tickPhysics() {
    if (this.state !== 'racing') return;

    const prevPositions = this.bikes.map((b) => {
      const { t } = distanceToCenterline(b.x, b.y);
      return t;
    });

    for (let i = 0; i < this.bikes.length; i++) {
      const bike = this.bikes[i];
      if (bike.finished || bike.fallen) continue;

      const player = [...this.players.values()].find((p) => p.slot === bike.slot);
      const turning = player?.input.turnLeft || false;
      bike.turning = turning;

      bike.speed = Math.min(BIKE.maxSpeed, bike.speed + BIKE.acceleration);

      if (turning) {
        bike.angle -= BIKE.turnRate;
      }

      bike.x += Math.cos(bike.angle) * bike.speed;
      bike.y += Math.sin(bike.angle) * bike.speed;

      if (hasHitBarrier(bike.x, bike.y)) {
        bike.fallen = true;
        bike.fallTime = Date.now();
        bike.speed = 0;
        bike.turning = false;
        continue;
      }

      const { t } = distanceToCenterline(bike.x, bike.y);
      updateLap(bike, prevPositions[i], t);
      bike.lastT = t;
    }

    for (let i = 0; i < this.bikes.length; i++) {
      for (let j = i + 1; j < this.bikes.length; j++) {
        if (this.bikes[i].fallen || this.bikes[j].fallen) continue;
        if (this.bikes[i].finished || this.bikes[j].finished) continue;
        if (bikesCollide(this.bikes[i], this.bikes[j])) {
          this.bikes[i].speed *= BIKE.collisionSlowdown;
          this.bikes[j].speed *= BIKE.collisionSlowdown;
          const dx = this.bikes[j].x - this.bikes[i].x;
          const dy = this.bikes[j].y - this.bikes[i].y;
          const dist = Math.hypot(dx, dy) || 1;
          const push = 2;
          this.bikes[i].x -= (dx / dist) * push;
          this.bikes[i].y -= (dy / dist) * push;
          this.bikes[j].x += (dx / dist) * push;
          this.bikes[j].y += (dy / dist) * push;
        }
      }
    }

  const active = this.bikes.filter((b) => !b.finished && !b.fallen);
    if (active.length === 0 && this.bikes.length > 0) {
      this.finishRace();
    } else if (
      active.length === 1 &&
      this.bikes.some((b) => b.finished)
    ) {
      const last = active[0];
      last.finished = true;
      last.finishTime = Date.now();
      this.finishRace();
    }
  }

  finishRace() {
    this.state = 'finished';
    const sorted = [...this.bikes]
      .filter((b) => b.finishTime)
      .sort((a, b) => a.finishTime - b.finishTime);
    this.winner = sorted[0] || null;
  }

  reset() {
    this.bikes = [];
    this.state = 'lobby';
    this.countdown = 0;
    this.raceStartTime = null;
    this.winner = null;
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
      hostId: this.hostId,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        color: p.color,
        ready: p.ready,
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
      winner: this.winner
        ? { name: this.winner.name, color: this.winner.color, slot: this.winner.slot }
        : null,
    };
  }
}

class GameManager {
  constructor() {
    this.rooms = new Map();
  }

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new GameRoom(roomId));
    }
    return this.rooms.get(roomId);
  }

  removeRoom(roomId) {
    this.rooms.delete(roomId);
  }

  findPlayerRoom(playerId) {
    for (const room of this.rooms.values()) {
      if (room.players.has(playerId)) return room;
    }
    return null;
  }
}

module.exports = {
  GameManager,
  BIKE,
  PLAYER_COLORS,
  PLAYER_NAMES,
  bikeEndpoints,
};
