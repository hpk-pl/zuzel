const TRACK_CONFIG = {
  centerX: 500,
  centerY: 350,
  straightHalf: 220,
  bendRadius: 130,
  width: 176,
};

const PALETTES = {
  classic: {
    background: '#d4b896',
    outer: '#7a5230',
    infield: '#4a9e4f',
    line: '#f5f5f0',
    finish: '#ffffff',
  },
  leszno: {
    background: '#8b7355',
    outer: '#5c3d28',
    infield: '#3d8f45',
    line: '#e8dcc8',
    finish: '#ffffff',
  },
};

let currentTrack = null;
const imageCache = new Map();
const imageReady = new Map();

function traceStadium(ctx, halfWidth, side, config = TRACK_CONFIG) {
  const { centerX, centerY, straightHalf, bendRadius } = config;
  const leftX = centerX - straightHalf;
  const rightX = centerX + straightHalf;
  const r = bendRadius + side * halfWidth;

  ctx.moveTo(leftX, centerY - r);
  ctx.lineTo(rightX, centerY - r);
  ctx.arc(rightX, centerY, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.lineTo(leftX, centerY + r);
  ctx.arc(leftX, centerY, r, Math.PI / 2, -Math.PI / 2, false);
}

function drawProceduralTrack(ctx, canvasW, canvasH, paletteName = 'classic') {
  const palette = PALETTES[paletteName] || PALETTES.classic;
  const { width } = TRACK_CONFIG;
  const hw = width / 2;

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = palette.outer;
  ctx.beginPath();
  traceStadium(ctx, hw, 1);
  traceStadium(ctx, hw, -1);
  ctx.fill('evenodd');

  ctx.fillStyle = palette.infield;
  ctx.beginPath();
  traceStadium(ctx, hw, -1);
  ctx.fill();

  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 4;
  ctx.beginPath();
  traceStadium(ctx, hw, 1);
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.beginPath();
  traceStadium(ctx, hw, -1);
  ctx.stroke();

  const botY = TRACK_CONFIG.centerY + TRACK_CONFIG.bendRadius;
  ctx.strokeStyle = palette.finish;
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(TRACK_CONFIG.centerX, botY - hw);
  ctx.lineTo(TRACK_CONFIG.centerX, botY + hw);
  ctx.stroke();
}

function drawFinishLine(ctx, opacity = 0.85) {
  const hw = TRACK_CONFIG.width / 2;
  const botY = TRACK_CONFIG.centerY + TRACK_CONFIG.bendRadius;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(TRACK_CONFIG.centerX, botY - hw);
  ctx.lineTo(TRACK_CONFIG.centerX, botY + hw);
  ctx.stroke();
  ctx.restore();
}

function drawImageTrack(ctx, canvasW, canvasH, image) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const scale = Math.max(canvasW / iw, canvasH / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  const dx = (canvasW - drawW) / 2;
  const dy = (canvasH - drawH) / 2;
  ctx.drawImage(image, dx, dy, drawW, drawH);
}

function preloadTrackImage(track) {
  if (!track?.image) return Promise.resolve({ image: null, ok: false });
  if (imageCache.has(track.id)) return imageCache.get(track.id);

  const img = new Image();
  const promise = new Promise((resolve) => {
    img.onload = () => {
      const result = { image: img, ok: true };
      imageReady.set(track.id, result);
      resolve(result);
    };
    img.onerror = () => {
      const result = { image: null, ok: false };
      imageReady.set(track.id, result);
      resolve(result);
    };
  });
  img.src = track.image;
  imageCache.set(track.id, promise);
  return promise;
}

function preloadAllTracks(catalog = []) {
  return Promise.all(catalog.map((track) => preloadTrackImage(track)));
}

function setCurrentTrack(track) {
  currentTrack = track || null;
}

function getCurrentTrack() {
  return currentTrack;
}

function drawTrack(ctx, canvasW, canvasH) {
  const track = currentTrack;
  const visual = track?.visual || { mode: 'procedural', palette: 'classic' };

  if (visual.mode === 'image' && track?.image) {
    const ready = imageReady.get(track.id);
    if (ready?.ok && ready.image) {
      drawImageTrack(ctx, canvasW, canvasH, ready.image);
      if (visual.showFinishLine) drawFinishLine(ctx, visual.finishLineOpacity ?? 0.85);
      return;
    }
    drawProceduralTrack(ctx, canvasW, canvasH, visual.fallbackPalette || 'leszno');
    return;
  }

  drawProceduralTrack(ctx, canvasW, canvasH, visual.palette || 'classic');
}

function drawTrails(ctx, bikes, trails) {
  for (const bike of bikes) {
    const points = trails.get(bike.slot);
    if (!points || points.length < 2) continue;

    ctx.strokeStyle = bike.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    const step = points.length > 600 ? 3 : 1;
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = step; i < points.length; i += step) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawBike(ctx, bike) {
  if (bike.fallen) {
    const len = 22;
    const hx = Math.cos(bike.angle) * len * 0.5;
    const hy = Math.sin(bike.angle) * len * 0.5;
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bike.x - hx, bike.y - hy);
    ctx.lineTo(bike.x + hx * 0.3, bike.y + hy * 0.3);
    ctx.stroke();
    ctx.fillStyle = '#cc2222';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('UPADEK', bike.x, bike.y - 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(bike.name, bike.x, bike.y - 4);
    return;
  }

  const len = 22;
  const hx = Math.cos(bike.angle) * len * 0.5;
  const hy = Math.sin(bike.angle) * len * 0.5;

  ctx.strokeStyle = bike.color;
  ctx.lineWidth = bike.turning ? 7 : 5;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(bike.x - hx, bike.y - hy);
  ctx.lineTo(bike.x + hx, bike.y + hy);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

window.TrackRender = {
  drawTrack,
  drawTrails,
  drawBike,
  setCurrentTrack,
  getCurrentTrack,
  preloadAllTracks,
  preloadTrackImage,
  TRACK_CONFIG,
};
