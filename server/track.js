/**
 * Owallowy tor żużlowy (kształt stadionu).
 * Jazda przeciwnie do ruchu wskazówek zegara, start w prawo.
 */

const TRACK = {
  centerX: 500,
  centerY: 350,
  straightHalf: 220,
  bendRadius: 130,
  width: 70,
  totalLaps: 4,
};

function centerlinePoint(t) {
  const { centerX, centerY, straightHalf, bendRadius } = TRACK;
  const straightLen = straightHalf * 2;
  const bendArc = Math.PI * bendRadius;
  const total = 2 * straightLen + 2 * bendArc;

  let d = ((t % 1) + 1) % 1;
  d *= total;

  const leftX = centerX - straightHalf;
  const rightX = centerX + straightHalf;
  const topY = centerY - bendRadius;
  const botY = centerY + bendRadius;

  if (d < straightLen) {
    const f = d / straightLen;
    return { x: leftX + f * straightLen * 2, y: topY, angle: 0 };
  }
  d -= straightLen;

  if (d < bendArc) {
    const f = d / bendArc;
    const a = -Math.PI / 2 + f * Math.PI;
    return {
      x: rightX + Math.cos(a) * bendRadius,
      y: centerY + Math.sin(a) * bendRadius,
      angle: a + Math.PI / 2,
    };
  }
  d -= bendArc;

  if (d < straightLen) {
    const f = d / straightLen;
    return { x: rightX - f * straightLen * 2, y: botY, angle: Math.PI };
  }
  d -= bendArc;

  const f = d / bendArc;
  const a = Math.PI / 2 + f * Math.PI;
  return {
    x: leftX + Math.cos(a) * bendRadius,
    y: centerY + Math.sin(a) * bendRadius,
    angle: a + Math.PI / 2,
  };
}

function centerlineTangent(t) {
  const eps = 0.001;
  const a = centerlinePoint(t);
  const b = centerlinePoint(t + eps);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return { x: a.x, y: a.y, angle };
}

function distanceToCenterline(x, y) {
  let best = Infinity;
  let bestT = 0;
  const steps = 200;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = centerlinePoint(t);
    const dx = x - p.x;
    const dy = y - p.y;
    const dist = dx * dx + dy * dy;
    if (dist < best) {
      best = dist;
      bestT = t;
    }
  }
  return { distance: Math.sqrt(best), t: bestT };
}

function isOnTrack(x, y) {
  const { distance } = distanceToCenterline(x, y);
  return distance <= TRACK.width / 2 - 2;
}

/** Wjazd w bandę (wewnętrzną lub zewnętrzną) = upadek */
function hasHitBarrier(x, y) {
  const { distance } = distanceToCenterline(x, y);
  return distance > TRACK.width / 2 - 2;
}

function getStartPositions(count) {
  const positions = [];
  const gridOffsets = [0.0, 0.008, 0.016, 0.024];

  for (let i = 0; i < count; i++) {
    const t = gridOffsets[i];
    const p = centerlineTangent(t);
    const perpAngle = p.angle - Math.PI / 2;
    const laneOffset = (i - (count - 1) / 2) * 14;
    positions.push({
      x: p.x + Math.cos(perpAngle) * laneOffset,
      y: p.y + Math.sin(perpAngle) * laneOffset,
      angle: p.angle,
    });
  }
  return positions;
}

function trackBounds() {
  const { centerX, centerY, straightHalf, bendRadius, width } = TRACK;
  const pad = width / 2 + 30;
  return {
    minX: centerX - straightHalf - bendRadius - pad,
    maxX: centerX + straightHalf + bendRadius + pad,
    minY: centerY - bendRadius - pad,
    maxY: centerY + bendRadius + pad,
  };
}

function sampleTrackPoints(segments = 120) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    points.push(centerlinePoint(i / segments));
  }
  return points;
}

module.exports = {
  TRACK,
  centerlinePoint,
  centerlineTangent,
  distanceToCenterline,
  isOnTrack,
  hasHitBarrier,
  getStartPositions,
  trackBounds,
  sampleTrackPoints,
};
