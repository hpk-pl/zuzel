const TRACK_CONFIG = {
  centerX: 500,
  centerY: 350,
  straightHalf: 220,
  bendRadius: 130,
  width: 176,
};

function traceStadium(ctx, halfWidth, side) {
  const { centerX, centerY, straightHalf, bendRadius } = TRACK_CONFIG;
  const leftX = centerX - straightHalf;
  const rightX = centerX + straightHalf;
  const r = bendRadius + side * halfWidth;

  ctx.moveTo(leftX, centerY - r);
  ctx.lineTo(rightX, centerY - r);
  ctx.arc(rightX, centerY, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.lineTo(leftX, centerY + r);
  ctx.arc(leftX, centerY, r, Math.PI / 2, -Math.PI / 2, false);
}

function drawTrack(ctx, canvasW, canvasH) {
  const { width } = TRACK_CONFIG;
  const hw = width / 2;

  ctx.fillStyle = '#d4b896';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = '#7a5230';
  ctx.beginPath();
  traceStadium(ctx, hw, 1);
  traceStadium(ctx, hw, -1);
  ctx.fill('evenodd');

  ctx.fillStyle = '#4a9e4f';
  ctx.beginPath();
  traceStadium(ctx, hw, -1);
  ctx.fill();

  ctx.strokeStyle = '#f5f5f0';
  ctx.lineWidth = 4;
  ctx.beginPath();
  traceStadium(ctx, hw, 1);
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.beginPath();
  traceStadium(ctx, hw, -1);
  ctx.stroke();

  const leftX = TRACK_CONFIG.centerX - TRACK_CONFIG.straightHalf;
  const botY = TRACK_CONFIG.centerY + TRACK_CONFIG.bendRadius;
  const centerX = TRACK_CONFIG.centerX;

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(centerX, botY - hw);
  ctx.lineTo(centerX, botY + hw);
  ctx.stroke();
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
    ctx.fillStyle = '#aaa';
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
  ctx.beginPath();
  ctx.moveTo(bike.x - hx, bike.y - hy);
  ctx.lineTo(bike.x + hx, bike.y + hy);
  ctx.stroke();
}

window.TrackRender = { drawTrack, drawTrails, drawBike, TRACK_CONFIG };
