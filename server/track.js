/**
 * Owallowy tor żużlowy (kształt stadionu).
 * Start na środku dolnej prostej, jazda w prawo, skręt w lewo (CCW).
 */

const TRACK = {
  centerX: 500,
  centerY: 350,
  straightHalf: 220,
  bendRadius: 130,
  width: 135,
  totalLaps: 4,
};

const TOTAL_HEATS = 15;
const HEAT_POINTS = [3, 2, 1, 0];
const BARRIER_MARGIN = 6;

function trackLength() {
  const straightLen = TRACK.straightHalf * 2;
  return 2 * straightLen + 2 * Math.PI * TRACK.bendRadius;
}

function getFinishT() {
  const straightLen = TRACK.straightHalf * 2;
  return (straightLen / 2) / trackLength();
}

function centerlinePoint(t) {
  const { centerX, centerY, straightHalf, bendRadius } = TRACK;
  const straightLen = straightHalf * 2;
  const bendArc = Math.PI * bendRadius;
  const total = trackLength();

  let d = ((t % 1) + 1) % 1;
  d *= total;

  const leftX = centerX - straightHalf;
  const rightX = centerX + straightHalf;
  const topY = centerY - bendRadius;
  const botY = centerY + bendRadius;

  if (d < straightLen) {
    const f = d / straightLen;
    return { x: leftX + f * straightLen, y: botY, angle: 0 };
  }
  d -= straightLen;

  if (d < bendArc) {
    const f = d / bendArc;
    const a = Math.PI / 2 - f * Math.PI;
    return {
      x: rightX + Math.cos(a) * bendRadius,
      y: centerY + Math.sin(a) * bendRadius,
      angle: a - Math.PI / 2,
    };
  }
  d -= bendArc;

  if (d < straightLen) {
    const f = d / straightLen;
    return { x: rightX - f * straightLen, y: topY, angle: Math.PI };
  }
  d -= bendArc;

  const f = d / bendArc;
  const a = -Math.PI / 2 + f * Math.PI;
  return {
    x: leftX + Math.cos(a) * bendRadius,
    y: centerY + Math.sin(a) * bendRadius,
    angle: a - Math.PI / 2,
  };
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distToArc(px, py, cx, cy, radius, angleStart, angleEnd) {
  const ang = Math.atan2(py - cy, px - cx);
  let a = ang;
  while (a < angleStart) a += Math.PI * 2;
  if (a > angleEnd && a - Math.PI * 2 >= angleStart) a -= Math.PI * 2;
  if (a >= angleStart && a <= angleEnd) {
    return Math.abs(Math.hypot(px - cx, py - cy) - radius);
  }
  const x1 = cx + Math.cos(angleStart) * radius;
  const y1 = cy + Math.sin(angleStart) * radius;
  const x2 = cx + Math.cos(angleEnd) * radius;
  const y2 = cy + Math.sin(angleEnd) * radius;
  return Math.min(
    Math.hypot(px - x1, py - y1),
    Math.hypot(px - x2, py - y2)
  );
}

/** Dokładna odległość od linii środkowej toru */
function distanceToCenterline(x, y) {
  const { centerX, centerY, straightHalf, bendRadius } = TRACK;
  const leftX = centerX - straightHalf;
  const rightX = centerX + straightHalf;
  const topY = centerY - bendRadius;
  const botY = centerY + bendRadius;

  const candidates = [
    distToSegment(x, y, leftX, botY, rightX, botY),
    distToSegment(x, y, rightX, topY, leftX, topY),
    distToArc(x, y, rightX, centerY, bendRadius, -Math.PI / 2, Math.PI / 2),
    distToArc(x, y, leftX, centerY, bendRadius, Math.PI / 2, (3 * Math.PI) / 2),
  ];

  const distance = Math.min(...candidates);

  let bestT = 0;
  let best = Infinity;
  for (let i = 0; i <= 400; i++) {
    const t = i / 400;
    const p = centerlinePoint(t);
    const d = (x - p.x) ** 2 + (y - p.y) ** 2;
    if (d < best) { best = d; bestT = t; }
  }

  return { distance, t: bestT };
}

function hasHitBarrier(x, y) {
  const { distance } = distanceToCenterline(x, y);
  return distance > TRACK.width / 2 - BARRIER_MARGIN;
}

/** Sprawdza środek i przód motocykla */
function bikeHitsBarrier(x, y, angle) {
  if (hasHitBarrier(x, y)) return true;
  const frontX = x + Math.cos(angle) * 12;
  const frontY = y + Math.sin(angle) * 12;
  return hasHitBarrier(frontX, frontY);
}

/** Start na linii mety — rozstawienie w poprzek toru */
function getStartPositions(riders) {
  const baseT = getFinishT();
  const p = centerlinePoint(baseT);
  const perpAngle = p.angle - Math.PI / 2;
  const count = riders.length;

  return riders.map((rider, i) => {
    const laneOffset = (i - (count - 1) / 2) * 18;
    return {
      slot: rider.slot,
      x: p.x + Math.cos(perpAngle) * laneOffset,
      y: p.y + Math.sin(perpAngle) * laneOffset,
      angle: p.angle,
    };
  });
}

module.exports = {
  TRACK,
  TOTAL_HEATS,
  HEAT_POINTS,
  centerlinePoint,
  distanceToCenterline,
  hasHitBarrier,
  bikeHitsBarrier,
  getStartPositions,
  getFinishT,
};
