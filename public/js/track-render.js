const TRACK_CONFIG = {
  centerX: 500,
  centerY: 350,
  straightHalf: 220,
  bendRadius: 130,
  width: 70,
};

function centerlinePoint(t) {
  const { centerX, centerY, straightHalf, bendRadius } = TRACK_CONFIG;
  const straightLen = straightHalf * 2;
  const bendArc = Math.PI * bendRadius;
  const total = 2 * straightLen + 2 * bendArc;

  let d = ((t % 1) + 1) % 1;
  d *= total;

  const leftX = centerX - straightHalf;
  const rightX = centerX + straightHalf;
  const topY = centerY - bendRadius;

  if (d < straightLen) {
    const f = d / straightLen;
    return { x: leftX + f * straightLen * 2, y: topY };
  }
  d -= straightLen;

  if (d < bendArc) {
    const f = d / bendArc;
    const a = -Math.PI / 2 + f * Math.PI;
    return {
      x: rightX + Math.cos(a) * bendRadius,
      y: centerY + Math.sin(a) * bendRadius,
    };
  }
  d -= bendArc;

  if (d < straightLen) {
    const f = d / straightLen;
    return { x: rightX - f * straightLen * 2, y: centerY + bendRadius };
  }
  d -= bendArc;

  const f = d / bendArc;
  const a = Math.PI / 2 + f * Math.PI;
  return {
    x: leftX + Math.cos(a) * bendRadius,
    y: centerY + Math.sin(a) * bendRadius,
  };
}

function drawTrack(ctx) {
  const { width } = TRACK_CONFIG;
  const segments = 160;
  const inner = [];
  const outer = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = centerlinePoint(t);
    const pNext = centerlinePoint(t + 1 / segments);
    const angle = Math.atan2(pNext.y - p.y, pNext.x - p.x);
    const perp = angle + Math.PI / 2;
    const hw = width / 2;
    inner.push({ x: p.x + Math.cos(perp) * hw, y: p.y + Math.sin(perp) * hw });
    outer.push({ x: p.x - Math.cos(perp) * hw, y: p.y - Math.sin(perp) * hw });
  }

  ctx.fillStyle = '#2d5a27';
  ctx.beginPath();
  ctx.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i].x, outer[i].y);
  for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i].x, inner[i].y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i].x, outer[i].y);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(inner[0].x, inner[0].y);
  for (let i = 1; i < inner.length; i++) ctx.lineTo(inner[i].x, inner[i].y);
  ctx.closePath();
  ctx.stroke();

  const start = centerlinePoint(0);
  const startNext = centerlinePoint(0.01);
  const sa = Math.atan2(startNext.y - start.y, startNext.x - start.x);
  const perp = sa + Math.PI / 2;
  const hw = width / 2;

  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 4;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(
    start.x + Math.cos(perp) * hw,
    start.y + Math.sin(perp) * hw
  );
  ctx.lineTo(
    start.x - Math.cos(perp) * hw,
    start.y - Math.sin(perp) * hw
  );
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '14px sans-serif';
  ctx.fillText('META', start.x - 20, start.y - 15);
}

function drawBike(ctx, bike) {
  const len = 22;
  const hx = Math.cos(bike.angle) * len * 0.5;
  const hy = Math.sin(bike.angle) * len * 0.5;
  const x1 = bike.x - hx;
  const y1 = bike.y - hy;
  const x2 = bike.x + hx;
  const y2 = bike.y + hy;

  ctx.strokeStyle = bike.offTrack ? '#888' : bike.color;
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
