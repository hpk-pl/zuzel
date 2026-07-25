const SLOT_KEYS = { 0: 'KeyA', 1: 'KeyS', 2: 'KeyK', 3: 'KeyL' };

const socket = io();
const canvas = document.getElementById('track-canvas');
const ctx = canvas.getContext('2d');

let myId = null;
let mySlot = null;
let gameState = null;
let joined = false;
const trails = new Map();

const $ = (id) => document.getElementById(id);

$('btn-join').addEventListener('click', joinRoom);
$('btn-ready').addEventListener('click', toggleReady);
$('btn-start').addEventListener('click', () => socket.emit('start-match'));
$('btn-next-heat').addEventListener('click', () => socket.emit('next-heat'));
$('btn-reset').addEventListener('click', () => socket.emit('reset'));
$('btn-save-teams').addEventListener('click', () => {
  socket.emit('team-names', {
    teamA: $('team-a-name').value.trim(),
    teamB: $('team-b-name').value.trim(),
  });
});

document.addEventListener('keydown', (e) => {
  if (!joined || mySlot === null) return;
  if (e.code === SLOT_KEYS[mySlot]) {
    e.preventDefault();
    socket.emit('input', { turnLeft: true });
  }
});
document.addEventListener('keyup', (e) => {
  if (!joined || mySlot === null) return;
  if (e.code === SLOT_KEYS[mySlot]) {
    socket.emit('input', { turnLeft: false });
  }
});

function joinRoom() {
  socket.emit('join', {
    name: $('player-name').value.trim() || 'Zawodnik',
    roomId: $('room-id').value.trim() || 'main',
    team: $('player-team').value,
  });
}

function toggleReady() {
  const me = gameState?.players.find((p) => p.id === myId);
  if (me) socket.emit('ready', !me.ready);
}

socket.on('connect', () => { myId = socket.id; });
socket.on('error', ({ message }) => alert(message));

socket.on('state', (state) => {
  if (state.state === 'countdown' && state.countdown >= 3) trails.clear();
  if (state.state === 'racing') {
    for (const bike of state.bikes || []) {
      if (!trails.has(bike.slot)) trails.set(bike.slot, []);
      if (bike.fallen) continue;
      const pts = trails.get(bike.slot);
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(bike.x - last.x, bike.y - last.y) > 2.5) {
        pts.push({ x: bike.x, y: bike.y });
        if (pts.length > 3000) pts.shift();
      }
    }
  }
  gameState = state;
  mySlot = state.players.find((p) => p.id === myId)?.slot ?? null;
  updateUI(state);
});

function updateUI(state) {
  if (!joined && state.players.some((p) => p.id === myId)) {
    joined = true;
    $('lobby-status').classList.remove('hidden');
    $('room-display').textContent = state.id;
    $('btn-join').classList.add('hidden');
    document.querySelector('.lobby-row').classList.add('hidden');
  }

  $('team-a-name').value = state.teamAName || 'Drużyna A';
  $('team-b-name').value = state.teamBName || 'Drużyna B';

  const teamsDiv = $('teams-display');
  teamsDiv.innerHTML = `
    <div class="team-score team-a">${escapeHtml(state.teamAName)}: <strong>${state.teamScores?.A ?? 0}</strong> pkt</div>
    <div class="team-score team-b">${escapeHtml(state.teamBName)}: <strong>${state.teamScores?.B ?? 0}</strong> pkt</div>
  `;

  $('player-list').innerHTML = state.players.map((p) => `
    <li>
      <span class="player-dot" style="background:${p.color}"></span>
      <span>[${p.team}] ${escapeHtml(p.name)}${p.id === myId ? ' (Ty)' : ''} — ${p.totalPoints} pkt</span>
      ${p.ready ? '<span class="ready-badge">Gotowy</span>' : ''}
    </li>
  `).join('');

  const me = state.players.find((p) => p.id === myId);
  const isHost = state.hostId === myId;

  $('btn-ready').textContent = me?.ready ? 'Nie gotowy' : 'Gotowy';
  $('btn-ready').classList.toggle('ready-on', !!me?.ready);
  $('btn-start').classList.toggle('hidden', !(isHost && state.state === 'lobby'));
  $('btn-next-heat').classList.toggle('hidden', !(isHost && state.state === 'heat_results'));
  $('btn-reset').classList.toggle('hidden', !(isHost && (state.state === 'heat_results' || state.state === 'match_finished')));

  const inGame = ['countdown', 'racing', 'heat_results', 'match_finished'].includes(state.state);
  $('game-area').classList.toggle('hidden', !inGame);

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
    content.innerHTML = `
      <div>Wynik biegu ${state.heatNumber}</div>
      <div class="heat-results">${rows}</div>
      <div class="heat-totals">
        ${escapeHtml(state.teamAName)}: ${state.teamScores.A} ·
        ${escapeHtml(state.teamBName)}: ${state.teamScores.B}
      </div>
      ${state.hostId === myId ? '<p class="hint">Kliknij „Następny bieg”</p>' : ''}`;
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
      <div>🏁 Koniec meczu!</div>
      <div class="winner">${winText}</div>
      <div class="final-score">${s.teamA.name} ${s.teamA.points} : ${s.teamB.points} ${s.teamB.name}</div>
      <div class="heat-results">${players}</div>`;
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

  $('score-board').innerHTML = state.players?.length
    ? `<div>${escapeHtml(state.teamAName)} ${state.teamScores?.A ?? 0} : ${state.teamScores?.B ?? 0} ${escapeHtml(state.teamBName)}</div>`
    : '';
}

function renderFrame() {
  const state = gameState;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state) {
    TrackRender.drawTrack(ctx, canvas.width, canvas.height);
    if (state.bikes?.length) {
      TrackRender.drawTrails(ctx, state.bikes, trails);
      for (const b of state.bikes) TrackRender.drawBike(ctx, b);
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
