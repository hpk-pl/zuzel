const SLOT_KEYS = { 0: 'ControlLeft', 1: 'KeyV', 2: 'ControlRight', 3: 'Numpad0' };
const SLOT_LABELS = ['L Ctrl', 'V', 'R Ctrl', 'Num 0'];
const SPEED_LEVELS = [70, 80, 90, 100];

const socket = io({ reconnection: true });
const canvas = document.getElementById('track-canvas');
const ctx = canvas.getContext('2d');

let gameState = null;
let socketConnected = false;
const trails = new Map();
const pressedSlots = new Set();

const $ = (id) => document.getElementById(id);

function setStartEnabled(enabled) {
  const btn = $('btn-start');
  if (!btn) return;
  btn.disabled = !enabled;
  btn.title = enabled ? '' : 'Łączenie z serwerem…';
}

function getSpeedDialLevel(dial) {
  return parseInt(dial.dataset.level, 10) || SPEED_LEVELS.length - 1;
}

function setSpeedDialLevel(dial, level, { emit = false } = {}) {
  const idx = Math.max(0, Math.min(SPEED_LEVELS.length - 1, level));
  dial.dataset.level = String(idx);
  const label = dial.querySelector('.speed-dial-label');
  if (label) label.textContent = `${SPEED_LEVELS[idx]}%`;
  if (emit) {
    const slot = parseInt(dial.dataset.slot, 10);
    socket.emit('speed-limit', { slot, percent: SPEED_LEVELS[idx] });
  }
}

function cycleSpeedDial(dial, delta, options = {}) {
  const next = (getSpeedDialLevel(dial) + delta + SPEED_LEVELS.length) % SPEED_LEVELS.length;
  setSpeedDialLevel(dial, next, options);
}

function bindSpeedDial(dial) {
  dial.addEventListener('click', () => cycleSpeedDial(dial, 1, { emit: gameState?.state === 'racing' }));
  dial.addEventListener('wheel', (e) => {
    e.preventDefault();
    cycleSpeedDial(dial, e.deltaY > 0 ? 1 : -1, { emit: gameState?.state === 'racing' });
  }, { passive: false });
}

document.querySelectorAll('.speed-dial').forEach(bindSpeedDial);

function getSpeedPercentForSlot(slot) {
  const dial = document.querySelector(`.speed-dial[data-slot="${slot}"]`);
  if (!dial) return 100;
  return SPEED_LEVELS[getSpeedDialLevel(dial)];
}

function syncSpeedDialsFromState(state) {
  const sources = [...(state.players || []), ...(state.bikes || [])];
  for (const item of sources) {
    if (item.speedPercent == null) continue;
    const level = SPEED_LEVELS.indexOf(item.speedPercent);
    if (level === -1) continue;
    document.querySelectorAll(`.speed-dial[data-slot="${item.slot}"]`).forEach((dial) => {
      setSpeedDialLevel(dial, level);
    });
  }
}

function collectRiders() {
  const riders = [];
  document.querySelectorAll('.rider-row').forEach((row) => {
    const slot = parseInt(row.dataset.slot, 10);
    const name = row.querySelector('.rider-name').value.trim();
    const team = row.querySelector('.rider-team').value;
    if (!name) return;
    riders.push({ slot, name, team, speedPercent: getSpeedPercentForSlot(slot) });
  });
  const teamA = riders.filter((r) => r.team === 'A').length;
  const teamB = riders.filter((r) => r.team === 'B').length;
  if (!riders.length || teamA > 2 || teamB > 2) return null;
  return riders;
}

function startMatch() {
  if (!socketConnected) {
    alert('Brak połączenia z serwerem. Poczekaj chwilę lub odśwież stronę (F5).');
    return;
  }
  const riders = collectRiders();
  if (!riders) {
    alert('Wpisz co najmniej 1 zawodnika (max 2 na drużynę).');
    return;
  }
  setStartEnabled(false);
  socket.emit('start-match', {
    riders,
    teamA: $('team-a-name').value.trim(),
    teamB: $('team-b-name').value.trim(),
  });
}

const btnStart = $('btn-start');
if (btnStart) {
  btnStart.addEventListener('click', startMatch);
  setStartEnabled(false);
}

socket.on('connect', () => {
  socketConnected = true;
  setStartEnabled(true);
});

socket.on('disconnect', () => {
  socketConnected = false;
  setStartEnabled(false);
});

socket.on('connect_error', () => {
  socketConnected = false;
  setStartEnabled(false);
});

$('overlay-content').addEventListener('click', (e) => {
  if (e.target.id === 'overlay-next-heat') socket.emit('next-heat');
  if (e.target.id === 'overlay-menu' || e.target.id === 'overlay-reset') socket.emit('reset');
});

document.addEventListener('keydown', (e) => {
  if (gameState?.state !== 'racing') return;
  if (e.repeat) return;
  for (const [slot, key] of Object.entries(SLOT_KEYS)) {
    if (e.code === key && !pressedSlots.has(slot)) {
      e.preventDefault();
      pressedSlots.add(slot);
      socket.emit('input', { slot: parseInt(slot, 10), turnLeft: true });
    }
  }
});

document.addEventListener('keyup', (e) => {
  for (const [slot, key] of Object.entries(SLOT_KEYS)) {
    if (e.code === key) {
      e.preventDefault();
      pressedSlots.delete(slot);
      socket.emit('input', { slot: parseInt(slot, 10), turnLeft: false });
    }
  }
});

socket.on('error', ({ message }) => {
  setStartEnabled(socketConnected);
  alert(message);
});

socket.on('state', (state) => {
  if (state.state === 'countdown' && state.countdown === 3) trails.clear();
  if (state.state === 'lobby') {
    pressedSlots.clear();
    trails.clear();
  }
  if (state.state === 'racing') {
    for (const bike of state.bikes || []) {
      if (!trails.has(bike.slot)) trails.set(bike.slot, []);
      const pts = trails.get(bike.slot);
      if (pts.length === 0) pts.push({ x: bike.x, y: bike.y });
      if (bike.fallen) continue;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(bike.x - last.x, bike.y - last.y) > 1.5) {
        pts.push({ x: bike.x, y: bike.y });
        if (pts.length > 3000) pts.shift();
      }
    }
  }
  gameState = state;
  syncSpeedDialsFromState(state);
  updateUI(state);
});

function updateUI(state) {
  const inMatch = ['countdown', 'racing', 'heat_results', 'match_finished'].includes(state.state);
  $('setup').classList.toggle('hidden', inMatch);
  $('game-area').classList.toggle('hidden', !inMatch);
  if (!inMatch) lastSpeedHudKey = '';

  if (!inMatch) setStartEnabled(socketConnected);

  $('team-a-name').value = state.teamAName || 'Drużyna A';
  $('team-b-name').value = state.teamBName || 'Drużyna B';

  $('teams-display').innerHTML = inMatch ? `
    <div class="team-score team-a">${escapeHtml(state.teamAName)}: <strong>${state.teamScores?.A ?? 0}</strong> pkt</div>
    <div class="team-score team-b">${escapeHtml(state.teamBName)}: <strong>${state.teamScores?.B ?? 0}</strong> pkt</div>
  ` : '';

  updateOverlay(state);
  updateHud(state);
}

function updateOverlay(state) {
  const overlay = $('overlay');
  const content = $('overlay-content');

  if (state.state === 'countdown' && state.countdown > 0) {
    overlay.classList.remove('hidden');
    content.innerHTML = `
      <div>Bieg ${state.heatNumber} / ${state.totalHeats}</div>
      <div class="countdown">${state.countdown}</div>`;
    return;
  }

  if (state.state === 'heat_results' && state.lastHeatResults) {
    overlay.classList.remove('hidden');
    const rows = state.lastHeatResults.map((r) =>
      `<div style="color:${r.color}">${escapeHtml(r.name)}: <strong>${r.label}</strong> → ${r.points} pkt</div>`
    ).join('');
    const nextBtn = state.canNextHeat
      ? '<button id="overlay-next-heat" class="btn primary overlay-btn">Następny bieg</button>'
      : '';
    content.innerHTML = `
      <div class="overlay-title">Wynik biegu ${state.heatNumber}</div>
      <div class="heat-results">${rows}</div>
      <div class="heat-totals">
        ${escapeHtml(state.teamAName)}: ${state.teamScores.A} ·
        ${escapeHtml(state.teamBName)}: ${state.teamScores.B}
      </div>
      <div class="overlay-actions">${nextBtn}<button id="overlay-menu" class="btn overlay-btn">Menu główne</button></div>`;
    return;
  }

  if (state.state === 'match_finished' && state.matchSummary) {
    overlay.classList.remove('hidden');
    const s = state.matchSummary;
    const winText = s.winner === 'draw' ? 'Remis!'
      : `🏆 Wygrywa: ${s.winner === 'A' ? s.teamA.name : s.teamB.name}`;
    const players = s.players.map((p) =>
      `<div style="color:${p.color}">[${p.team}] ${escapeHtml(p.name)}: ${p.totalPoints} pkt</div>`
    ).join('');
    content.innerHTML = `
      <div class="overlay-title">🏁 Koniec meczu!</div>
      <div class="winner">${winText}</div>
      <div class="final-score">${s.teamA.name} ${s.teamA.points} : ${s.teamB.points} ${s.teamB.name}</div>
      <div class="heat-results">${players}</div>
      <div class="overlay-actions">
        <button id="overlay-menu" class="btn primary overlay-btn">Menu główne</button>
      </div>`;
    return;
  }

  overlay.classList.add('hidden');
}

let lastSpeedHudKey = '';

function updateHud(state) {
  $('race-info').textContent = state.heatNumber
    ? `Bieg ${state.heatNumber}/${state.totalHeats} · ${state.totalLaps} okr.`
    : '';

  $('lap-board').innerHTML = (state.bikes || []).map((b) => {
    let st;
    if (b.fallen) st = 'UPADEK';
    else if (b.finished) st = 'META';
    else st = `Okr. ${b.lap}/${state.totalLaps}`;
    const pct = b.speedPercent ?? 100;
    return `<div style="color:${b.fallen ? '#888' : b.color}">${escapeHtml(b.name)}: ${st} · ${pct}%</div>`;
  }).join('');

  const hud = $('speed-dials-hud');
  const hudKey = (state.bikes || []).map((b) => `${b.slot}:${b.name}:${b.color}`).join('|');
  if (hud && hudKey !== lastSpeedHudKey) {
    lastSpeedHudKey = hudKey;
    hud.innerHTML = (state.bikes || []).map((b) => {
      const level = SPEED_LEVELS.indexOf(b.speedPercent ?? 100);
      const dialLevel = level === -1 ? SPEED_LEVELS.length - 1 : level;
      return `
        <div class="speed-dial-hud-row" style="border-left:3px solid ${b.color}">
          <span>${SLOT_LABELS[b.slot]} ${escapeHtml(b.name)}</span>
          <div class="speed-dial" data-slot="${b.slot}" data-level="${dialLevel}" title="Limit prędkości">
            <div class="speed-dial-face"><div class="speed-dial-knob"></div></div>
            <span class="speed-dial-label">${b.speedPercent ?? 100}%</span>
          </div>
        </div>`;
    }).join('');
    hud.querySelectorAll('.speed-dial').forEach(bindSpeedDial);
  } else if (hud) {
    for (const b of state.bikes || []) {
      const dial = hud.querySelector(`.speed-dial[data-slot="${b.slot}"]`);
      if (!dial) continue;
      const level = SPEED_LEVELS.indexOf(b.speedPercent ?? 100);
      if (level !== -1) setSpeedDialLevel(dial, level);
    }
  }

  $('score-board').innerHTML = state.heatNumber
    ? `<div>${escapeHtml(state.teamAName)} ${state.teamScores?.A ?? 0} : ${state.teamScores?.B ?? 0} ${escapeHtml(state.teamBName)}</div>`
    : '';
}

function renderFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (gameState) {
    TrackRender.drawTrack(ctx, canvas.width, canvas.height);
    if (gameState.bikes?.length) {
      TrackRender.drawTrails(ctx, gameState.bikes, trails);
      for (const b of gameState.bikes) TrackRender.drawBike(ctx, b);
    }
  }
  requestAnimationFrame(renderFrame);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

renderFrame();
