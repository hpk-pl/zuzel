(function () {
  const CANVAS_W = 1000;
  const CANVAS_H = 700;
  const HANDLE_R = 9;
  const HIT_R = 14;
  const STORAGE_KEY = 'zuzel-custom-tracks';

  const canvas = document.getElementById('builder-canvas');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('export-status');
  const exportArea = document.getElementById('export-json');

  const LEGACY_GEOMETRY = {
    centerX: 500,
    centerY: 350,
    straightHalf: 220,
    bendRadius: 130,
    width: 176,
    totalLaps: 4,
    barrierMargin: 6,
    startLaneSpacing: 23,
  };

  function createDefaultGeometry() {
    if (window.TrackGeometry?.normalizeGeometry) {
      return window.TrackGeometry.normalizeGeometry(LEGACY_GEOMETRY);
    }
    const { centerX, centerY, straightHalf, bendRadius, width, totalLaps, barrierMargin, startLaneSpacing } = LEGACY_GEOMETRY;
    const hw = width / 2;
    return {
      outer: { centerX, centerY, straightHalf, bendRadius: bendRadius + hw },
      inner: { centerX, centerY, straightHalf, bendRadius: Math.max(20, bendRadius - hw) },
      centerline: { centerX, centerY, straightHalf, bendRadius },
      finishLine: null,
      totalLaps,
      barrierMargin,
      startLaneSpacing,
    };
  }

  const defaults = createDefaultGeometry();

  let editingCustomTrackId = null;
  let baseCatalogTracks = [];
  let pickerCatalog = [];
  let catalogSelectBound = false;

  let bgImage = null;
  let bgObjectUrl = null;
  let pendingImageFile = null;
  let savedImageDataUrl = null;
  let bgCache = null;
  let bgCacheDirty = true;
  let dragHandle = null;
  let dragOffset = { x: 0, y: 0 };
  let exportPreviewTimer = null;
  let renderPending = false;

  const state = {
    id: 'custom-moj-tor',
    name: 'Mój tor',
    description: 'Tor skalibrowany w edytorze',
    image: null,
    geometry: JSON.parse(JSON.stringify(defaults)),
    finishLine: null,
    visual: {
      mode: 'image',
      fit: 'cover',
      showVectorLayer: true,
      showFinishLine: true,
      finishLineOpacity: 0.85,
    },
  };

  function $(id) { return document.getElementById(id); }

  function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = `builder-status${type ? ` ${type}` : ''}`;
  }

  const OVAL_COLORS = {
    outer: { center: '#ff4646', side: '#ff9999', arc: '#ff7777' },
    inner: { center: '#46dc6e', side: '#99eeaa', arc: '#77dd99' },
    centerline: { center: '#58a6ff', side: '#99bbff', arc: '#77aaff' },
  };

  function getGeo() {
    return state.geometry;
  }

  function defaultFinishLine(geo = getGeo()) {
    const cx = (geo.inner.centerX + geo.outer.centerX) / 2;
    const y1 = geo.inner.centerY + geo.inner.bendRadius;
    const y2 = geo.outer.centerY + geo.outer.bendRadius;
    return { x1: cx, y1, x2: cx, y2 };
  }

  function getFinishLine() {
    return state.finishLine || getGeo().finishLine || defaultFinishLine();
  }

  function syncFinishToGeometry() {
    state.finishLine = defaultFinishLine();
    getGeo().finishLine = { ...state.finishLine };
  }

  function ovalHandles(oval, prefix, colors) {
    return {
      [`${prefix}-center`]: { x: oval.centerX, y: oval.centerY, color: colors.center, label: 'Środek' },
      [`${prefix}-left`]: { x: oval.centerX - oval.straightHalf, y: oval.centerY, color: colors.side, label: 'Lewa prosta' },
      [`${prefix}-right`]: { x: oval.centerX + oval.straightHalf, y: oval.centerY, color: colors.side, label: 'Prawa prosta' },
      [`${prefix}-top`]: { x: oval.centerX, y: oval.centerY - oval.bendRadius, color: colors.arc, label: 'Góra łuku' },
      [`${prefix}-bottom`]: { x: oval.centerX, y: oval.centerY + oval.bendRadius, color: colors.arc, label: 'Dół łuku' },
    };
  }

  function getHandles() {
    const geo = getGeo();
    const finish = getFinishLine();
    const handles = {};

    if (editMode === 'outer') Object.assign(handles, ovalHandles(geo.outer, 'outer', OVAL_COLORS.outer));
    if (editMode === 'inner') Object.assign(handles, ovalHandles(geo.inner, 'inner', OVAL_COLORS.inner));
    if (editMode === 'centerline') Object.assign(handles, ovalHandles(geo.centerline, 'centerline', OVAL_COLORS.centerline));
    if (editMode === 'finish') {
      handles['finishA'] = { x: finish.x1, y: finish.y1, color: '#ffffff', label: 'Meta A' };
      handles['finishB'] = { x: finish.x2, y: finish.y2, color: '#ffffff', label: 'Meta B' };
    }

    return handles;
  }

  function updateEditModeHint() {
    const hints = {
      outer: 'Tryb: banda zewnętrzna — przeciągaj czerwone uchwyty (środek · proste · łuki)',
      inner: 'Tryb: banda wewnętrzna — przeciągaj zielone uchwyty (środek · proste · łuki)',
      centerline: 'Tryb: środek trasy (fizyka) — przeciągaj niebieskie uchwyty',
      finish: 'Tryb: linia start/meta — przeciągaj białe uchwyty',
    };
    $('canvas-hint').textContent = hints[editMode] || hints.outer;
  }

  function invalidateBgCache() {
    bgCacheDirty = true;
  }

  function prepareBgImageSource(img) {
    const maxDim = 1600;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (Math.max(iw, ih) <= maxDim) {
      bgImage = img;
      invalidateBgCache();
      scheduleRender();
      return;
    }
    const scale = maxDim / Math.max(iw, ih);
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    off.getContext('2d').drawImage(img, 0, 0, w, h);
    bgImage = off;
    invalidateBgCache();
    scheduleRender();
  }

  function rebuildBgCache() {
    if (!bgCache) {
      bgCache = document.createElement('canvas');
      bgCache.width = CANVAS_W;
      bgCache.height = CANVAS_H;
    }
    const bctx = bgCache.getContext('2d');
    bctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (!$('show-bg').checked) {
      bctx.fillStyle = '#1a1a1a';
      bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      bgCacheDirty = false;
      return;
    }

    if (bgImage) {
      const iw = bgImage.naturalWidth || bgImage.width;
      const ih = bgImage.naturalHeight || bgImage.height;
      const scale = Math.max(CANVAS_W / iw, CANVAS_H / ih);
      const drawW = iw * scale;
      const drawH = ih * scale;
      const dx = (CANVAS_W - drawW) / 2;
      const dy = (CANVAS_H - drawH) / 2;
      bctx.drawImage(bgImage, dx, dy, drawW, drawH);
      bgCacheDirty = false;
      return;
    }

    bctx.fillStyle = '#3d3428';
    bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    bctx.fillStyle = 'rgba(255,255,255,0.15)';
    bctx.font = '16px sans-serif';
    bctx.textAlign = 'center';
    bctx.fillText('Wgraj tło stadionu lub wybierz tor z katalogu', CANVAS_W / 2, CANVAS_H / 2);
    bgCacheDirty = false;
  }

  function drawBackground() {
    if (bgCacheDirty || !bgCache) rebuildBgCache();
    ctx.drawImage(bgCache, 0, 0);
  }

  function drawOverlays() {
    const geo = getGeo();
    const TG = window.TrackGeometry;

    if ($('show-outer').checked) {
      ctx.strokeStyle = 'rgba(255, 70, 70, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      TG.traceStadiumOval(ctx, geo.outer);
      ctx.stroke();
    }

    if ($('show-inner').checked) {
      ctx.strokeStyle = 'rgba(70, 220, 110, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      TG.traceStadiumOval(ctx, geo.inner);
      ctx.stroke();
    }

    if ($('show-center').checked) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      TG.traceStadiumOval(ctx, geo.centerline);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if ($('show-finish').checked) {
      const fl = getFinishLine();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fl.x1, fl.y1);
      ctx.lineTo(fl.x2, fl.y2);
      ctx.stroke();
    }
  }

  function drawHandles() {
    const handles = getHandles();
    for (const [key, h] of Object.entries(handles)) {
      const active = dragHandle === key;
      ctx.beginPath();
      ctx.arc(h.x, h.y, active ? HANDLE_R + 2 : HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#fff' : h.color;
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function render() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawBackground();
    drawOverlays();
    drawHandles();
  }

  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      render();
    });
  }

  function canvasPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function hitHandle(pt) {
    const handles = getHandles();
    let best = null;
    let bestDist = HIT_R;
    for (const [key, h] of Object.entries(handles)) {
      const d = Math.hypot(pt.x - h.x, pt.y - h.y);
      if (d <= bestDist) {
        bestDist = d;
        best = key;
      }
    }
    return best;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function applyDrag(handle, x, y) {
    if (handle === 'finishA' || handle === 'finishB') {
      if (!state.finishLine) state.finishLine = { ...getFinishLine() };
      if (handle === 'finishA') {
        state.finishLine.x1 = clamp(x, 0, CANVAS_W);
        state.finishLine.y1 = clamp(y, 0, CANVAS_H);
      } else {
        state.finishLine.x2 = clamp(x, 0, CANVAS_W);
        state.finishLine.y2 = clamp(y, 0, CANVAS_H);
      }
      getGeo().finishLine = { ...state.finishLine };
      return;
    }

    const dash = handle.indexOf('-');
    if (dash === -1) return;
    const ovalName = handle.slice(0, dash);
    const part = handle.slice(dash + 1);
    const geo = getGeo();
    const oval = geo[ovalName];
    if (!oval) return;

    if (part === 'center') {
      oval.centerX = clamp(x, 80, CANVAS_W - 80);
      oval.centerY = clamp(y, 80, CANVAS_H - 80);
      return;
    }
    if (part === 'left') {
      oval.straightHalf = clamp(oval.centerX - x, 40, 400);
      return;
    }
    if (part === 'right') {
      oval.straightHalf = clamp(x - oval.centerX, 40, 400);
      return;
    }
    if (part === 'top') {
      oval.bendRadius = clamp(oval.centerY - y, 20, 350);
      return;
    }
    if (part === 'bottom') {
      oval.bendRadius = clamp(y - oval.centerY, 20, 350);
    }
  }

  function onPointerDown(evt) {
    evt.preventDefault();
    const pt = canvasPoint(evt);
    const handle = hitHandle(pt);
    if (!handle) return;
    dragHandle = handle;
    const h = getHandles()[handle];
    dragOffset = { x: pt.x - h.x, y: pt.y - h.y };
    $('canvas-hint').textContent = `Przeciągasz: ${h.label}`;
    canvas.setPointerCapture?.(evt.pointerId);
  }

  function onPointerMove(evt) {
    if (!dragHandle) return;
    evt.preventDefault();
    const pt = canvasPoint(evt);
    applyDrag(dragHandle, pt.x - dragOffset.x, pt.y - dragOffset.y);
    scheduleRender();
  }

  function onPointerUp(evt) {
    if (!dragHandle) return;
    dragHandle = null;
    updateEditModeHint();
    canvas.releasePointerCapture?.(evt.pointerId);
    scheduleExportPreview();
  }

  function normalizeLoadedGeometry(raw) {
    if (window.TrackGeometry?.normalizeGeometry) {
      return window.TrackGeometry.normalizeGeometry(raw || {});
    }
    return createDefaultGeometry();
  }

  function revokeBgObjectUrl() {
    if (bgObjectUrl) {
      URL.revokeObjectURL(bgObjectUrl);
      bgObjectUrl = null;
    }
  }

  function imagePreviewLabel() {
    if (pendingImageFile) return `«${pendingImageFile.name} — dołączany przy zapisie»`;
    if (savedImageDataUrl) return '«zapisane tło (JPEG)»';
    if (state.image && !state.image.startsWith('data:')) return state.image;
    if (state.image) return '«zapisane tło»';
    return null;
  }

  function buildTrackDefinition({ includeImage = false } = {}) {
    const geo = JSON.parse(JSON.stringify(getGeo()));
    geo.totalLaps = parseInt($('param-laps').value, 10) || 4;
    geo.barrierMargin = parseFloat($('param-margin').value) || 6;
    geo.startLaneSpacing = parseFloat($('param-spacing').value) || 23;
    const fl = getFinishLine();
    geo.finishLine = { x1: Math.round(fl.x1), y1: Math.round(fl.y1), x2: Math.round(fl.x2), y2: Math.round(fl.y2) };
    for (const key of ['outer', 'inner', 'centerline']) {
      for (const prop of ['centerX', 'centerY', 'straightHalf', 'bendRadius']) {
        geo[key][prop] = Math.round(geo[key][prop]);
      }
    }

    const id = $('track-id').value.trim().replace(/\s+/g, '-').toLowerCase() || 'custom-moj-tor';
    const trackId = id.startsWith('custom-') ? id : `custom-${id}`;
    const imageValue = includeImage
      ? (savedImageDataUrl || state.image || null)
      : imagePreviewLabel();

    return {
      id: trackId,
      name: $('track-name').value.trim() || 'Mój tor',
      description: $('track-desc').value.trim() || 'Tor skalibrowany w edytorze',
      preview: imageValue,
      image: imageValue,
      geometry: geo,
      visual: { ...state.visual, showVectorLayer: false },
      custom: true,
    };
  }

  function compressBgImage(quality = 0.82, maxDim = 1400) {
    return new Promise((resolve, reject) => {
      if (!bgImage) {
        reject(new Error('Brak tła'));
        return;
      }
      const source = bgImage;
      const iw = source.naturalWidth || source.width;
      const ih = source.naturalHeight || source.height;
      const scale = Math.min(1, maxDim / Math.max(iw, ih));
      const w = Math.max(1, Math.round(iw * scale));
      const h = Math.max(1, Math.round(ih * scale));
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      off.getContext('2d').drawImage(source, 0, 0, w, h);
      resolve(off.toDataURL('image/jpeg', quality));
    });
  }

  async function buildTrackDefinitionForExport() {
    const def = buildTrackDefinition({ includeImage: false });
    if (bgImage) {
      const dataUrl = await compressBgImage();
      def.image = dataUrl;
      def.preview = dataUrl;
      savedImageDataUrl = dataUrl;
      state.image = dataUrl;
      pendingImageFile = null;
    } else if (state.image) {
      def.image = state.image;
      def.preview = state.image;
    }
    return def;
  }

  function updateExportPreview() {
    exportArea.value = JSON.stringify(buildTrackDefinition({ includeImage: false }), null, 2);
  }

  function scheduleExportPreview() {
    if (exportPreviewTimer) clearTimeout(exportPreviewTimer);
    exportPreviewTimer = setTimeout(() => {
      exportPreviewTimer = null;
      updateExportPreview();
    }, 120);
  }

  function updateDeleteButton() {
    const btn = $('btn-delete-track');
    if (btn) btn.classList.toggle('hidden', !editingCustomTrackId);
  }

  function readLocalCustomTracks() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"tracks":[]}').tracks || [];
    } catch {
      return [];
    }
  }

  function resetToNewTrack() {
    editingCustomTrackId = null;
    updateDeleteButton();
    state.id = 'custom-moj-tor';
    state.name = 'Mój tor';
    state.description = 'Tor skalibrowany w edytorze';
    state.image = null;
    state.geometry = JSON.parse(JSON.stringify(defaults));
    state.finishLine = null;
    state.visual = {
      mode: 'image',
      fit: 'cover',
      showVectorLayer: true,
      showFinishLine: true,
      finishLineOpacity: 0.85,
    };

    $('track-id').value = 'custom-moj-tor';
    $('track-name').value = state.name;
    $('track-desc').value = state.description;
    $('param-laps').value = state.geometry.totalLaps ?? 4;
    $('param-margin').value = state.geometry.barrierMargin ?? 6;
    $('param-spacing').value = state.geometry.startLaneSpacing ?? 23;

    pendingImageFile = null;
    savedImageDataUrl = null;
    revokeBgObjectUrl();
    bgImage = null;
    invalidateBgCache();
    syncFinishToGeometry();
    scheduleExportPreview();
    scheduleRender();
  }

  function refreshCatalogOptions() {
    populateCatalogSelect([...baseCatalogTracks, ...readLocalCustomTracks()]);
  }

  function loadTrackDefinition(track) {
    if (!track) return;
    editingCustomTrackId = track.custom ? track.id : null;
    updateDeleteButton();
    state.id = track.id;
    state.name = track.name;
    state.description = track.description || '';
    state.image = track.image || track.preview || null;
    state.geometry = normalizeLoadedGeometry(track.geometry);
    state.finishLine = state.geometry.finishLine ? { ...state.geometry.finishLine } : null;
    state.visual = { ...state.visual, ...(track.visual || {}) };

    $('track-id').value = track.id.replace(/^custom-/, '');
    $('track-name').value = track.name;
    $('track-desc').value = track.description || '';
    $('param-laps').value = state.geometry.totalLaps ?? 4;
    $('param-margin').value = state.geometry.barrierMargin ?? 6;
    $('param-spacing').value = state.geometry.startLaneSpacing ?? 23;

    pendingImageFile = null;
    savedImageDataUrl = state.image?.startsWith('data:') ? state.image : null;

    if (state.image) {
      loadBackgroundFromUrl(state.image);
    } else {
      revokeBgObjectUrl();
      bgImage = null;
      invalidateBgCache();
    }
    updateExportPreview();
    scheduleRender();
  }

  function loadBackgroundFromUrl(url) {
    const img = new Image();
    img.onload = () => prepareBgImageSource(img);
    img.onerror = () => setStatus('Nie udało się wczytać obrazu tła.', 'err');
    img.src = url;
  }

  function saveCustomTrack(definition) {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"tracks":[]}');
    const tracks = stored.tracks || [];
    const idx = tracks.findIndex((t) => t.id === definition.id);
    if (idx >= 0) tracks[idx] = definition;
    else tracks.push(definition);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tracks }));
  }

  function populateCatalogSelect(catalog) {
    const editable = catalog.filter((track) => !track.locked);
    pickerCatalog = editable;
    const select = $('load-track-select');
    select.innerHTML = '<option value="">— wybierz —</option>';
    for (const track of editable) {
      const opt = document.createElement('option');
      opt.value = track.id;
      opt.textContent = track.name;
      select.appendChild(opt);
    }
    if (!catalogSelectBound) {
      catalogSelectBound = true;
      select.addEventListener('change', () => {
        const track = pickerCatalog.find((t) => t.id === select.value);
        if (track) loadTrackDefinition(track);
      });
    }
  }

  function bindUi() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    $('bg-upload').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      revokeBgObjectUrl();
      pendingImageFile = file;
      savedImageDataUrl = null;
      bgObjectUrl = URL.createObjectURL(file);
      setStatus('Wczytywanie tła…', '');
      loadBackgroundFromUrl(bgObjectUrl);
      state.visual.mode = 'image';
      scheduleExportPreview();
      setStatus(`Wgrano „${file.name}”. Dopasuj bandy do grafiki.`, 'ok');
    });

    ['show-bg', 'show-outer', 'show-inner', 'show-center', 'show-finish'].forEach((id) => {
      $(id).addEventListener('change', () => {
        if (id === 'show-bg') invalidateBgCache();
        scheduleRender();
      });
    });

    ['track-id', 'track-name', 'track-desc', 'param-laps', 'param-margin', 'param-spacing'].forEach((id) => {
      $(id).addEventListener('input', scheduleExportPreview);
    });

    $('btn-reset-finish').addEventListener('click', () => {
      syncFinishToGeometry();
      scheduleRender();
      scheduleExportPreview();
      setStatus('Linia mety wyrównana między bandami.', 'ok');
    });

    $('btn-auto-centerline').addEventListener('click', () => {
      const geo = getGeo();
      geo.centerline = window.TrackGeometry.averageOval(geo.inner, geo.outer);
      scheduleRender();
      scheduleExportPreview();
      setStatus('Środek trasy ustawiony między bandami.', 'ok');
    });

    document.querySelectorAll('input[name="edit-mode"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        editMode = radio.value;
        updateEditModeHint();
        scheduleRender();
      });
    });

    $('btn-save-game').addEventListener('click', async () => {
      setStatus('Zapisywanie toru…', '');
      try {
        const def = await buildTrackDefinitionForExport();
        saveCustomTrack(def);
        editingCustomTrackId = def.id;
        updateDeleteButton();
        refreshCatalogOptions();
        const select = $('load-track-select');
        if (select) select.value = def.id;
        scheduleExportPreview();
        setStatus(`Zapisano „${def.name}” — tor pojawi się w menu gry po odświeżeniu.`, 'ok');
      } catch (err) {
        setStatus(`Błąd zapisu: ${err.message}`, 'err');
      }
    });

    $('btn-delete-track').addEventListener('click', () => {
      if (!editingCustomTrackId) return;
      const name = $('track-name').value.trim() || editingCustomTrackId;
      if (!confirm(`Usunąć tor „${name}”? Tej operacji nie można cofnąć.`)) return;

      const deleted = window.deleteCustomTrack
        ? window.deleteCustomTrack(editingCustomTrackId)
        : false;
      if (!deleted) {
        const tracks = readLocalCustomTracks().filter((t) => t.id !== editingCustomTrackId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ tracks }));
      }

      $('load-track-select').value = '';
      refreshCatalogOptions();
      resetToNewTrack();
      setStatus(`Usunięto tor „${name}”.`, 'ok');
    });

    $('btn-copy-json').addEventListener('click', async () => {
      setStatus('Przygotowywanie JSON…', '');
      try {
        const def = await buildTrackDefinitionForExport();
        const json = JSON.stringify(def, null, 2);
        exportArea.value = json;
        await navigator.clipboard.writeText(json);
        setStatus('JSON skopiowany do schowka.', 'ok');
      } catch {
        exportArea.select();
        document.execCommand('copy');
        setStatus('JSON zaznaczony — użyj Ctrl+C.', 'ok');
      }
    });

    $('btn-download-json').addEventListener('click', async () => {
      setStatus('Przygotowywanie pliku…', '');
      try {
        const def = await buildTrackDefinitionForExport();
        const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${def.id}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        scheduleExportPreview();
        setStatus(`Pobrano ${def.id}.json`, 'ok');
      } catch (err) {
        setStatus(`Błąd eksportu: ${err.message}`, 'err');
      }
    });
  }

  async function init() {
    if (!window.TrackGeometry) {
      setStatus('Uwaga: brak track-geometry.js — używam trybu awaryjnego.', 'err');
    }

    try {
      bindUi();
      syncFinishToGeometry();
      updateEditModeHint();

      let catalog = [];
      try {
        const res = await fetch('/tracks.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        catalog = data.tracks || [];
      } catch (err) {
        setStatus(`Nie udało się wczytać tracks.json: ${err.message}`, 'err');
      }

      let custom = [];
      try {
        custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"tracks":[]}').tracks || [];
      } catch {
        setStatus('Uszkodzone tory w localStorage — pomijam.', 'err');
      }

      baseCatalogTracks = catalog;
      populateCatalogSelect([...catalog, ...custom]);

      const params = new URLSearchParams(window.location.search);
      const editId = params.get('edit');
      const all = [...catalog, ...custom];
      if (editId) {
        const track = all.find((t) => t.id === editId);
        if (track) loadTrackDefinition(track);
      }

      updateExportPreview();
      scheduleRender();
    } catch (err) {
      console.error(err);
      setStatus(`Błąd inicjalizacji edytora: ${err.message}`, 'err');
    }
  }

  init();
})();
