const SLOT_KEYS = { 0: 'KeyA', 1: 'KeyS', 2: 'KeyK', 3: 'KeyL' };

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

function collectRiders() {
  const riders = [];
  document.querySelectorAll('.rider-row').forEach((row) => {
    const slot = parseInt(row.dataset.slot, 10);
    const name = row.querySelector('.rider-name').value.trim();
    const team = row.querySelector('.rider-team').value;
    if (!name) return;
    riders.push({ slot, name, team });
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
  if (e.target.id === 'overlay-reset') socket.emit('reset');
});

document.addEventListener('keydown', (e) => {
  if (gameState?.state !== 'racing') return;
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
  updateUI(state);
});

function updateUI(state) {
  const inMatch = ['countdown', 'racing', 'heat_results', 'match_finished'].includes(state.state);
  $('setup').classList.toggle('hidden', inMatch);
  $('game-area').classList.toggle('hidden', !inMatch);

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
      <div class="overlay-actions">${nextBtn}</div>`;
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
        <button id="overlay-reset" class="btn primary overlay-btn">Nowy mecz</button>
      </div>`;
    return;
  }

  overlay.classList.add('hidden');
}

function updateHud(state) {
  $('race-info').textContent = state.heatNumber
    ? `Bieg ${state.heatNumber}/${state.totalHeats} · ${state.totalLaps} okr.`
    : '';

  $('lap-board').innerHTML = (state.bikes || []).map((b) => {
    let st;
    if (b.fallen) st = 'UPADEK';
    else if (b.finished) st = 'META';
    else st = `Okr. ${b.lap}/${state.totalLaps}`;
    return `<div style="color:${b.fallen ? '#888' : b.color}">${escapeHtml(b.name)}: ${st}</div>`;
  }).join('');

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
