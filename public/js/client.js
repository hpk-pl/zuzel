const SLOT_KEYS = {
  0: 'KeyA',
  1: 'KeyS',
  2: 'KeyK',
  3: 'KeyL',
};

const socket = io();
const canvas = document.getElementById('track-canvas');
const ctx = canvas.getContext('2d');

let myId = null;
let mySlot = null;
let gameState = null;
let joined = false;
let keysDown = new Set();

const $ = (id) => document.getElementById(id);

$('btn-join').addEventListener('click', joinRoom);
$('btn-ready').addEventListener('click', toggleReady);
$('btn-start').addEventListener('click', () => socket.emit('start'));
$('btn-reset').addEventListener('click', () => socket.emit('reset'));

$('player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});

document.addEventListener('keydown', (e) => {
  if (!joined || mySlot === null) return;
  const myKey = SLOT_KEYS[mySlot];
  if (e.code === myKey) {
    e.preventDefault();
    keysDown.add(e.code);
    socket.emit('input', { turnLeft: true });
  }
});

document.addEventListener('keyup', (e) => {
  if (!joined || mySlot === null) return;
  const myKey = SLOT_KEYS[mySlot];
  if (e.code === myKey) {
    keysDown.delete(e.code);
    socket.emit('input', { turnLeft: false });
  }
});

function joinRoom() {
  const name = $('player-name').value.trim() || 'Zawodnik';
  const roomId = $('room-id').value.trim() || 'main';
  socket.emit('join', { roomId, name });
}

function toggleReady() {
  const me = gameState?.players.find((p) => p.id === myId);
  if (!me) return;
  socket.emit('ready', !me.ready);
}

socket.on('connect', () => {
  myId = socket.id;
});

socket.on('error', ({ message }) => {
  alert(message);
});

socket.on('state', (state) => {
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

  const list = $('player-list');
  list.innerHTML = '';
  for (const p of state.players) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="player-dot" style="background:${p.color}"></span>
      <span>${escapeHtml(p.name)}${p.id === myId ? ' (Ty)' : ''}</span>
      ${p.ready ? '<span class="ready-badge">Gotowy</span>' : ''}
    `;
    list.appendChild(li);
  }

  const me = state.players.find((p) => p.id === myId);
  const isHost = state.hostId === myId;

  $('btn-ready').textContent = me?.ready ? 'Nie gotowy' : 'Gotowy';
  $('btn-ready').classList.toggle('ready-on', !!me?.ready);
  $('btn-start').classList.toggle('hidden', !(isHost && state.state === 'lobby'));
  $('btn-reset').classList.toggle('hidden', !(isHost && state.state === 'finished'));

  const racing = state.state === 'countdown' || state.state === 'racing' || state.state === 'finished';
  $('game-area').classList.toggle('hidden', !racing);

  updateOverlay(state);
  updateHud(state);
}

function updateOverlay(state) {
  const overlay = $('overlay');
  const content = $('overlay-content');

  if (state.state === 'countdown' && state.countdown > 0) {
    overlay.classList.remove('hidden');
    content.innerHTML = `<div class="countdown">${state.countdown}</div>`;
    return;
  }

  if (state.state === 'finished' && state.winner) {
    overlay.classList.remove('hidden');
    content.innerHTML = `
      <div>🏁 Koniec wyścigu!</div>
      <div class="winner" style="color:${state.winner.color}">
        Zwycięzca: ${escapeHtml(state.winner.name)}
      </div>
    `;
    return;
  }

  overlay.classList.add('hidden');
}

function updateHud(state) {
  const info = $('race-info');
  const board = $('lap-board');

  const stateLabel = {
    countdown: 'Odliczanie...',
    racing: `Wyścig — ${state.totalLaps} okrążenia`,
    finished: 'Koniec',
  };
  info.textContent = stateLabel[state.state] || '';

  if (!state.bikes.length) {
    board.innerHTML = '';
    return;
  }

  board.innerHTML = state.bikes
    .map((b) => {
      const status = b.finished ? 'META ✓' : `Okr. ${b.lap}/${state.totalLaps}`;
      return `<div style="color:${b.color}">${escapeHtml(b.name)}: ${status}</div>`;
    })
    .join('');
}

function renderFrame() {
  const state = gameState;
  if (!state) {
    requestAnimationFrame(renderFrame);
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a472a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  TrackRender.drawTrack(ctx);

  if (state.bikes) {
    for (const bike of state.bikes) {
      TrackRender.drawBike(ctx, bike);
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
