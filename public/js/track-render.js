const TRACK_CONFIG = {
  centerX: 500,
  centerY: 350,
  straightHalf: 220,
  bendRadius: 130,
  width: 70,
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

function drawTrack(ctx) {
  const { width } = TRACK_CONFIG;
  const hw = width / 2;

  ctx.fillStyle = '#2d5a27';
  ctx.beginPath();
  traceStadium(ctx, hw, 1);
  traceStadium(ctx, hw, -1);
  ctx.fill('evenodd');

  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  traceStadium(ctx, hw, 1);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.beginPath();
  traceStadium(ctx, hw, -1);
  ctx.stroke();

  const leftX = TRACK_CONFIG.centerX - TRACK_CONFIG.straightHalf;
  const topY = TRACK_CONFIG.centerY - TRACK_CONFIG.bendRadius;

  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 4;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(leftX, topY - hw);
  ctx.lineTo(leftX, topY + hw);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('META', leftX - 42, topY - 8);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 12]);
  ctx.beginPath();
  ctx.moveTo(leftX + 30, topY - hw + 4);
  ctx.lineTo(leftX + 30, topY + hw - 4);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBike(ctx, bike) {
  if (bike.fallen) {
    const len = 22;
    const hx = Math.cos(bike.angle) * len * 0.5;
    const hy = Math.sin(bike.angle) * len * 0.5;
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bike.x - hx, bike.y - hy);
    ctx.lineTo(bike.x + hx * 0.3, bike.y + hy * 0.3);
    ctx.stroke();
    ctx.fillStyle = '#ff4444';
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
  const x1 = bike.x - hx;
  const y1 = bike.y - hy;
  const x2 = bike.x + hx;
  const y2 = bike.y + hy;

  ctx.strokeStyle = bike.color;
  ctx.lineWidth = bike.turning ? 6 : 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.fillStyle = bike.color;
  ctx.beginPath();
  ctx.arc(x2, y2, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(bike.name, bike.x, bike.y - 14);
}

window.TrackRender = { drawTrack, drawBike, TRACK_CONFIG };
