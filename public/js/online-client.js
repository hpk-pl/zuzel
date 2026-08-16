(function () {
  const PICKABLE_COLORS = window.PICKABLE_COLORS || ['#FF2D55', '#FF9500', '#FFCC00', '#30D158', '#00D4FF', '#007AFF', '#BF5AF2', '#FF6B35'];
  const SPEED_LEVELS = [70, 80, 90, 100];

  let pendingAction = null;
  let pendingJoinCode = '';
  let selectedColor = null;
  let selectedTeam = null;
  let lobbyReady = false;
  let lobbySyncing = false;
  let mySlot = null;
  let joinCode = null;
  let gameState = null;
  let speedLevel = 3;
  let sentRacingSpeedLimit = false;
  let appliedTrackId = null;
  let lastHudUpdate = 0;
  let playerSessionId = null;
  let trackWarmupId = null;
  let trackWarmupPromise = null;
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
    renderLobbyColorPicker(null);
  }

  function getTakenColors(state, excludeSlot) {
    return new Set(
      (state?.lobbyPlayers || [])
        .filter((p) => p.slot !== excludeSlot && p.color)
        .map((p) => p.color),
    );
  }

  function renderLobbyColorPicker(state) {
    const container = $('lobby-color-options');
    if (!container) return;
    const taken = getTakenColors(state, mySlot);
    container.innerHTML = PICKABLE_COLORS.map((color) => {
      const takenByOther = taken.has(color) && color !== selectedColor;
      const selected = color === selectedColor;
      return `<button type="button" class="color-option${selected ? ' selected' : ''}${takenByOther ? ' taken' : ''}" data-color="${color}" style="background:${color}" ${takenByOther ? 'disabled' : ''} aria-label="Kolor ${color}"></button>`;
    }).join('');
    container.querySelectorAll('.color-option:not(.taken)').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedColor = btn.dataset.color;
        lobbyReady = false;
        renderLobbyColorPicker(gameState);
        updateLobbyTeamButtons(gameState);
        $('btn-lobby-ready').textContent = 'Gotowy!';
        $('btn-lobby-ready').classList.remove('ready-active');
        socket.emit('update-profile', { color: selectedColor });
      });
    });
  }

  function updateLobbyTeamButtons(state) {
    const counts = { A: 0, B: 0 };
    for (const p of state?.lobbyPlayers || []) {
      if (p.team === 'A') counts.A += 1;
      if (p.team === 'B') counts.B += 1;
    }
    const btnA = $('btn-pick-team-a');
    const btnB = $('btn-pick-team-b');
    if (!btnA || !btnB) return;
    const aFull = counts.A >= 2 && selectedTeam !== 'A';
    const bFull = counts.B >= 2 && selectedTeam !== 'B';
    btnA.disabled = aFull;
    btnB.disabled = bFull;
    btnA.classList.toggle('selected', selectedTeam === 'A');
    btnB.classList.toggle('selected', selectedTeam === 'B');
  }

  function syncMyLobbyFromState(state) {
    const me = (state.lobbyPlayers || []).find((p) => p.slot === mySlot);
    if (!me) return;
    lobbySyncing = true;
    selectedColor = me.color || selectedColor;
    selectedTeam = me.team || selectedTeam;
    lobbyReady = !!me.ready;
    const lvl = SPEED_LEVELS.indexOf(me.speedPercent ?? 100);
    speedLevel = lvl >= 0 ? lvl : 3;
    $('btn-lobby-speed').textContent = `${SPEED_LEVELS[speedLevel]}%`;
    $('btn-speed').textContent = `${SPEED_LEVELS[speedLevel]}%`;
    const readyBtn = $('btn-lobby-ready');
    readyBtn.textContent = lobbyReady ? 'Gotowy ✓' : 'Gotowy!';
    readyBtn.classList.toggle('ready-active', lobbyReady);
    renderLobbyColorPicker(state);
    updateLobbyTeamButtons(state);
    lobbySyncing = false;
  }

  function profilePayload() {
    const name = $('profile-name').value.trim();
    if (!name) return null;
    return {
      name,
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
  }

  /** Ładuje obraz toru i buduje warstwę tła zanim ruszy bieg. */
  function ensureTrackReady(trackId) {
    if (!trackId) return Promise.resolve();
    if (trackWarmupId === trackId && trackWarmupPromise) return trackWarmupPromise;

    const track = window.TRACK_BY_ID?.[trackId];
    if (!track) return Promise.resolve();

    applyTrackVisual(trackId);
    trackWarmupId = trackId;
    trackWarmupPromise = Promise.resolve()
      .then(() => (track.image && window.TrackRender?.preloadTrackImage
        ? TrackRender.preloadTrackImage(track)
        : null))
      .then(() => {
        if (appliedTrackId === trackId && window.TrackRender?.drawTrack) {
          TrackRender.drawTrack(ctx, canvas.width, canvas.height);
        }
      })
      .catch(() => {});

    return trackWarmupPromise;
  }

  function updateLobby(state) {
    joinCode = state.joinCode || joinCode;
    $('lobby-code').textContent = joinCode || '------';
    const players = (state.lobbyPlayers || []).filter((p) => p.connected !== false);
    $('lobby-count').textContent = `${players.length}/4`;
    const readyCount = players.filter((p) => p.ready).length;
    $('lobby-ready-status').textContent = `Gotowi: ${readyCount}/${players.length}`;

    const isHost = state.isHost;
    $('lobby-host-teams').classList.toggle('hidden', !isHost);
    if (isHost && !lobbySyncing) {
      if (document.activeElement !== $('lobby-team-a-name')) {
        $('lobby-team-a-name').value = state.teamAName || 'Drużyna A';
      }
      if (document.activeElement !== $('lobby-team-b-name')) {
        $('lobby-team-b-name').value = state.teamBName || 'Drużyna B';
      }
    }

    $('lobby-players').innerHTML = players.map((p) => {
      const badges = [];
      if (p.socketId === state.hostId) badges.push('<span class="host-badge">host</span>');
      if (p.ready) badges.push('<span class="ready-badge">gotowy</span>');
      else badges.push('<span class="not-ready-badge">czeka</span>');
      const kickBtn = isHost && p.socketId && p.socketId !== state.hostId
        ? `<button type="button" class="kick-btn" data-kick-slot="${p.slot}">Wyrzuć</button>`
        : '';
      const swatchColor = p.color || '#555';
      const teamLabel = p.team ? `drużyna ${p.team}` : 'wybiera drużynę…';
      const speedLabel = p.speedPercent ? ` · ${p.speedPercent}%` : '';
      return `
      <li>
        <span class="swatch" style="background:${swatchColor}"></span>
        <span>${escapeHtml(p.name)} · ${teamLabel}${speedLabel}</span>
        ${badges.join('')}
        ${kickBtn}
      </li>`;
    }).join('');

    $('lobby-players').querySelectorAll('.kick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = Number(btn.dataset.kickSlot);
        if (Number.isFinite(slot)) socket.emit('kick-player', { slot });
      });
    });

    syncMyLobbyFromState(state);

    $('lobby-host-actions').classList.toggle('hidden', !isHost);
    $('lobby-wait').classList.toggle('hidden', isHost);
    const canStart = isHost && state.lobbyCanStart
      && (state.state === 'lobby' || state.state === 'match_finished');
    $('btn-start-match').disabled = !canStart;
    $('lobby-start-hint').textContent = canStart
      ? 'Wszyscy gotowi — możesz startować!'
      : 'Wszyscy gracze muszą wybrać drużynę, kolor i kliknąć Gotowy.';
  }

  function updateOverlay(state) {
    const overlay = $('overlay');
    const content = $('overlay-content');

    if (state.state === 'countdown' && state.countdown > 0) {
      overlay.classList.remove('hidden');
      const loadingHint = state.heatNumber === 1 && state.countdown >= 4
        ? '<div class="setup-hint">Ładowanie toru…</div>'
        : '';
      content.innerHTML = `
        <div>Bieg ${state.heatNumber} / ${state.totalHeats}</div>
        ${loadingHint}
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

    if (state.trackId) ensureTrackReady(state.trackId);

    const inMatch = ['countdown', 'racing', 'heat_results', 'match_finished'].includes(state.state);

    if (!inMatch && state.mode === 'online') {
      sentRacingSpeedLimit = false;
      showScreen('screen-lobby');
      updateLobby(state);
      updateOverlay(state);
      return;
    }

    if (inMatch) {
      if (state.trackId) ensureTrackReady(state.trackId);
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
    $('profile-title').textContent = 'Stwórz grę — podaj nick';
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
    $('profile-title').textContent = 'Dołącz do gry — podaj nick';
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

  function pickTeam(team) {
    if (lobbySyncing) return;
    selectedTeam = team;
    lobbyReady = false;
    updateLobbyTeamButtons(gameState);
    $('btn-lobby-ready').textContent = 'Gotowy!';
    $('btn-lobby-ready').classList.remove('ready-active');
    socket.emit('update-profile', { team });
  }

  $('btn-pick-team-a').addEventListener('click', () => pickTeam('A'));
  $('btn-pick-team-b').addEventListener('click', () => pickTeam('B'));

  $('btn-lobby-speed').addEventListener('click', () => {
    if (lobbySyncing) return;
    speedLevel = (speedLevel + 1) % SPEED_LEVELS.length;
    const pct = SPEED_LEVELS[speedLevel];
    $('btn-lobby-speed').textContent = `${pct}%`;
    lobbyReady = false;
    $('btn-lobby-ready').textContent = 'Gotowy!';
    $('btn-lobby-ready').classList.remove('ready-active');
    socket.emit('update-profile', { speedPercent: pct });
  });

  $('btn-lobby-ready').addEventListener('click', () => {
    if (!selectedTeam || !selectedColor) {
      alert('Wybierz kolor i drużynę.');
      return;
    }
    const nextReady = !lobbyReady;
    socket.emit('set-lobby-ready', { ready: nextReady });
  });

  let teamNamesTimer = null;
  function emitTeamNames() {
    if (!gameState?.isHost) return;
    socket.emit('set-team-names', {
      teamA: $('lobby-team-a-name').value.trim(),
      teamB: $('lobby-team-b-name').value.trim(),
    });
  }
  $('lobby-team-a-name')?.addEventListener('input', () => {
    clearTimeout(teamNamesTimer);
    teamNamesTimer = setTimeout(emitTeamNames, 400);
  });
  $('lobby-team-b-name')?.addEventListener('input', () => {
    clearTimeout(teamNamesTimer);
    teamNamesTimer = setTimeout(emitTeamNames, 400);
  });

  $('btn-leave-room').addEventListener('click', () => {
    clearRoomSession();
    socket.emit('leave-room');
    showScreen('screen-landing');
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

  socket.on('room-left', () => {
    clearRoomSession();
    showScreen('screen-landing');
  });

  socket.on('kicked', ({ message }) => {
    clearRoomSession();
    alert(message || 'Wyrzucono cię z pokoju.');
    showScreen('screen-landing');
  });

  socket.on('room-ready', (data) => {
    joinCode = data.joinCode;
    mySlot = data.slot;
    const sid = data.sessionId || getOrCreatePlayerSessionId();
    playerSessionId = sid;
    saveRoomSession({ joinCode: data.joinCode, sessionId: sid, slot: data.slot });
    hideReconnectBanner();
    sentRacingSpeedLimit = false;
    selectedColor = null;
    selectedTeam = null;
    lobbyReady = false;
    if (!data.reconnected) showScreen('screen-lobby');
  });

  socket.on('state', (state) => {
    const enteringCountdown = state.state === 'countdown'
      && gameState?.state !== 'countdown';
    if (enteringCountdown) trails.clear();
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
    ensureTrackReady(trackId);
  }).catch(() => {});
})();
