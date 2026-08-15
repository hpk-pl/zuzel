(function () {
  const PICKABLE_COLORS = window.PICKABLE_COLORS || ['#FF2D55', '#FF9500', '#FFCC00', '#30D158', '#00D4FF', '#007AFF', '#BF5AF2', '#FF6B35'];
  const SPEED_LEVELS = [70, 80, 90, 100];

  let pendingAction = null;
  let pendingJoinCode = '';
  let selectedColor = PICKABLE_COLORS[0];
  let mySlot = null;
  let joinCode = null;
  let gameState = null;
  let speedLevel = 3;
  let sentRacingSpeedLimit = false;
  let appliedTrackId = null;
  let lastHudUpdate = 0;
  let playerSessionId = null;
  const trails = new Map();

  const SESSION_KEY = 'zuzel_player_session';
  const ROOM_KEY = 'zuzel_room_session';

  function getOrCreatePlayerSessionId() {
    if (playerSessionId) return playerSessionId;
    try {
      let id = localStorage.getItem(SESSION_KEY);
      if (!id) {
        id = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(SESSION_KEY, id);
      }
      playerSessionId = id;
      return id;
    } catch {
      playerSessionId = `p-${Date.now()}`;
      return playerSessionId;
    }
  }

  function saveRoomSession(data) {
    try {
      localStorage.setItem(ROOM_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  }

  function loadRoomSession() {
    try {
      const raw = localStorage.getItem(ROOM_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearRoomSession() {
    try { localStorage.removeItem(ROOM_KEY); } catch { /* ignore */ }
  }

  function showReconnectBanner(message = 'Połączenie zerwane — dotknij, aby wrócić do gry') {
    $('reconnect-message').textContent = message;
    $('reconnect-banner').classList.remove('hidden');
  }

  function hideReconnectBanner() {
    $('reconnect-banner').classList.add('hidden');
  }

  const socket = io({ reconnection: true });
  const canvas = document.getElementById('track-canvas');
  const ctx = canvas.getContext('2d');

  const $ = (id) => document.getElementById(id);

  function showScreen(name) {
    for (const id of ['screen-landing', 'screen-profile', 'screen-lobby', 'screen-game']) {
      $(id).classList.toggle('hidden', id !== name);
    }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function initColorPicker() {
    const container = $('color-options');
    container.innerHTML = PICKABLE_COLORS.map((color) =>
      `<button type="button" class="color-option${color === selectedColor ? ' selected' : ''}" data-color="${color}" style="background:${color}" aria-label="Kolor ${color}"></button>`
    ).join('');
    container.querySelectorAll('.color-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedColor = btn.dataset.color;
        container.querySelectorAll('.color-option').forEach((b) => b.classList.toggle('selected', b === btn));
      });
    });
  }

  function profilePayload() {
    const name = $('profile-name').value.trim();
    if (!name) return null;
    return {
      name,
      team: $('profile-team').value,
      color: selectedColor,
      sessionId: getOrCreatePlayerSessionId(),
    };
  }

  function attemptRejoin() {
    const saved = loadRoomSession();
    if (!saved?.joinCode || !saved?.sessionId) {
      showReconnectBanner('Brak zapisanej gry — odśwież stronę i dołącz kodem');
      return;
    }
    showReconnectBanner('Łączenie…');
    socket.emit('rejoin-room', {
      joinCode: saved.joinCode,
      sessionId: saved.sessionId,
    });
  }

  function applyTrackVisual(trackId) {
    if (!trackId || trackId === appliedTrackId) return;
    const track = window.TRACK_BY_ID?.[trackId];
    if (!track || !window.TrackRender?.setCurrentTrack) return;
    appliedTrackId = trackId;
    TrackRender.setCurrentTrack({
      ...track,
      visual: { ...track.visual, showVectorLayer: false },
    });
    if (track.image) TrackRender.preloadTrackImage(track);
  }

  function updateLobby(state) {
    joinCode = state.joinCode || joinCode;
    $('lobby-code').textContent = joinCode || '------';
    const players = state.lobbyPlayers || [];
    $('lobby-count').textContent = `${players.length}/4`;
    $('lobby-players').innerHTML = players.map((p) => `
      <li>
        <span class="swatch" style="background:${p.color}"></span>
        <span>${escapeHtml(p.name)} · drużyna ${p.team}</span>
        ${p.socketId === state.hostId ? '<span class="host-badge">host</span>' : ''}
        ${p.connected === false ? '<span class="offline-badge">offline</span>' : ''}
      </li>`).join('');

    const isHost = state.isHost;
    $('lobby-host-actions').classList.toggle('hidden', !isHost);
    $('lobby-wait').classList.toggle('hidden', isHost);
    const canStart = isHost && players.length >= 1 && (state.state === 'lobby' || state.state === 'match_finished');
    $('btn-start-match').disabled = !canStart;
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
      const nextBtn = state.isHost && state.canNextHeat
        ? '<button id="overlay-next-heat" class="btn primary overlay-btn">Następny bieg</button>'
        : '';
      content.innerHTML = `
        <div class="overlay-title">Wynik biegu ${state.heatNumber}</div>
        <div class="heat-results">${rows}</div>
        <div class="overlay-actions">${nextBtn}</div>`;
      return;
    }

    if (state.state === 'match_finished' && state.matchSummary) {
      overlay.classList.remove('hidden');
      const s = state.matchSummary;
      const winText = s.winner === 'draw' ? 'Remis!'
        : `🏆 ${s.winner === 'A' ? s.teamA.name : s.teamB.name}`;
      content.innerHTML = `
        <div class="overlay-title">🏁 Koniec meczu!</div>
        <div class="winner">${winText}</div>
        <div class="final-score">${s.teamA.points} : ${s.teamB.points}</div>
        <div class="overlay-actions">
          ${state.isHost ? '<button id="overlay-reset" class="btn primary overlay-btn">Nowy mecz</button>' : ''}
          <button id="overlay-menu" class="btn overlay-btn">Menu główne</button>
        </div>`;
      return;
    }

    overlay.classList.add('hidden');
  }

  function updateGameHud(state, force = false) {
    const now = performance.now();
    if (!force && state.state === 'racing' && now - lastHudUpdate < 200) return;
    lastHudUpdate = now;

    const trackName = window.TRACK_BY_ID?.[state.trackId]?.name || 'Tor';
    $('race-info-mobile').textContent = state.heatNumber
      ? `Bieg ${state.heatNumber}/${state.totalHeats} · ${trackName}`
      : '';

    const myBike = (state.bikes || []).find((b) => b.slot === mySlot);
    if (myBike) {
      let st;
      if (myBike.fallen) st = 'UPADEK';
      else if (myBike.finished) st = 'META';
      else st = `Okrążenie ${myBike.lap}/${state.totalLaps}`;
      $('my-status-mobile').innerHTML = `<strong style="color:${myBike.color}">${escapeHtml(myBike.name)}</strong> · ${st} · ${myBike.speedPercent ?? 100}%`;
    } else {
      $('my-status-mobile').textContent = '';
    }

    $('score-mobile').textContent = `${state.teamAName} ${state.teamScores?.A ?? 0} : ${state.teamScores?.B ?? 0} ${state.teamBName}`;
  }

  function handleState(state) {
    const wasInMatch = gameState
      && ['countdown', 'racing', 'heat_results', 'match_finished'].includes(gameState.state);
    gameState = state;
    mySlot = state.mySlot;

    if (state.trackId) applyTrackVisual(state.trackId);

    const inMatch = ['countdown', 'racing', 'heat_results', 'match_finished'].includes(state.state);

    if (!inMatch && state.mode === 'online') {
      sentRacingSpeedLimit = false;
      showScreen('screen-lobby');
      updateLobby(state);
      updateOverlay(state);
      return;
    }

    if (inMatch) {
      showScreen('screen-game');
      updateGameHud(state, state.state !== 'racing');
      updateOverlay(state);
      if (state.state === 'racing' && mySlot != null && !sentRacingSpeedLimit) {
        sentRacingSpeedLimit = true;
        socket.emit('speed-limit', { percent: SPEED_LEVELS[speedLevel] });
      } else if (!wasInMatch && state.state === 'countdown') {
        sentRacingSpeedLimit = false;
      }
      return;
    }

    sentRacingSpeedLimit = false;
    showScreen('screen-landing');
  }

  function renderFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameState && window.TrackRender) {
      TrackRender.drawTrack(ctx, canvas.width, canvas.height);
      if (gameState.bikes?.length) {
        TrackRender.drawTrails(ctx, gameState.bikes, trails);
        for (const b of gameState.bikes) TrackRender.drawBike(ctx, b);
      }
    }
    requestAnimationFrame(renderFrame);
  }

  // --- UI events ---
  $('btn-create-game').addEventListener('click', () => {
    clearRoomSession();
    pendingAction = 'create';
    pendingJoinCode = '';
    $('profile-title').textContent = 'Stwórz grę — twój zawodnik';
    showScreen('screen-profile');
  });

  $('btn-join-game').addEventListener('click', () => {
    const code = $('join-code-input').value.trim().toUpperCase();
    if (code.length < 4) {
      alert('Wpisz kod pokoju (6 znaków).');
      return;
    }
    clearRoomSession();
    pendingAction = 'join';
    pendingJoinCode = code;
    $('profile-title').textContent = 'Dołącz do gry — twój zawodnik';
    showScreen('screen-profile');
  });

  $('btn-profile-back').addEventListener('click', () => {
    pendingAction = null;
    showScreen('screen-landing');
  });

  $('btn-profile-confirm').addEventListener('click', () => {
    const profile = profilePayload();
    if (!profile) {
      alert('Wpisz nick.');
      return;
    }
    if (pendingAction === 'create') {
      socket.emit('create-room', profile);
    } else if (pendingAction === 'join') {
      socket.emit('join-room', { joinCode: pendingJoinCode, ...profile });
    }
  });

  $('btn-copy-code').addEventListener('click', async () => {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(joinCode);
      $('btn-copy-code').textContent = 'Skopiowano!';
      setTimeout(() => { $('btn-copy-code').textContent = 'Kopiuj'; }, 1500);
    } catch {
      prompt('Kod pokoju:', joinCode);
    }
  });

  $('btn-start-match').addEventListener('click', () => {
    socket.emit('start-match', {});
  });

  const turnBtn = $('btn-turn');
  function setTurn(active) {
    turnBtn.classList.toggle('turning', active);
    socket.emit('input', { turnLeft: active });
  }
  turnBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setTurn(true); });
  turnBtn.addEventListener('pointerup', () => setTurn(false));
  turnBtn.addEventListener('pointerleave', () => setTurn(false));
  turnBtn.addEventListener('pointercancel', () => setTurn(false));

  $('btn-speed').addEventListener('click', () => {
    speedLevel = (speedLevel + 1) % SPEED_LEVELS.length;
    const pct = SPEED_LEVELS[speedLevel];
    $('btn-speed').textContent = `${pct}%`;
    if (gameState?.state === 'racing') socket.emit('speed-limit', { percent: pct });
  });

  $('overlay-content').addEventListener('click', (e) => {
    if (e.target.id === 'overlay-next-heat') socket.emit('next-heat');
    if (e.target.id === 'overlay-reset') socket.emit('reset');
    if (e.target.id === 'overlay-menu') {
      clearRoomSession();
      location.reload();
      return;
    }
  });

  $('btn-reconnect').addEventListener('click', () => attemptRejoin());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setTurn(false);
  });

  socket.on('connect', () => {
    hideReconnectBanner();
    const saved = loadRoomSession();
    if (saved?.joinCode && saved?.sessionId) {
      attemptRejoin();
    }
  });

  socket.on('disconnect', () => {
    setTurn(false);
    if (loadRoomSession()) {
      showReconnectBanner();
    }
  });

  socket.on('room-ready', (data) => {
    joinCode = data.joinCode;
    mySlot = data.slot;
    const sid = data.sessionId || getOrCreatePlayerSessionId();
    playerSessionId = sid;
    saveRoomSession({ joinCode: data.joinCode, sessionId: sid, slot: data.slot });
    hideReconnectBanner();
    sentRacingSpeedLimit = false;
    if (!data.reconnected) showScreen('screen-lobby');
  });

  socket.on('state', (state) => {
    if (state.state === 'countdown' && state.countdown === 3) trails.clear();
    if (state.state === 'racing') {
      for (const bike of state.bikes || []) {
        if (!trails.has(bike.slot)) trails.set(bike.slot, []);
        const pts = trails.get(bike.slot);
        if (pts.length === 0) pts.push({ x: bike.x, y: bike.y });
        if (!bike.fallen) {
          const last = pts[pts.length - 1];
          if (!last || Math.hypot(bike.x - last.x, bike.y - last.y) > 2.5) {
            pts.push({ x: bike.x, y: bike.y });
            if (pts.length > 800) pts.shift();
          }
        }
      }
    }
    handleState(state);
  });

  socket.on('error', ({ message }) => {
    if (loadRoomSession()) showReconnectBanner(message);
    else alert(message);
  });

  initColorPicker();
  renderFrame();

  loadTrackCatalog().then(() => {
    const trackId = window.getDefaultTrackId?.() || 'classic';
    applyTrackVisual(trackId);
  }).catch(() => {});
})();
