/**
 * Owallowy tor żużlowy (kształt stadionu).
 * Start na środku dolnej prostej, jazda w prawo, skręt w lewo (CCW).
 */

const TRACK = {
  centerX: 500,
  centerY: 350,
  straightHalf: 220,
  bendRadius: 130,
  width: 105,
  totalLaps: 4,
};

function trackLength() {
  const straightLen = TRACK.straightHalf * 2;
  return 2 * straightLen + 2 * Math.PI * TRACK.bendRadius;
}

/** Pozycja t mety / startu (środek dolnej prostej) */
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

  // Dolna prosta: w lewo → w prawo
  if (d < straightLen) {
    const f = d / straightLen;
    return { x: leftX + f * straightLen * 2, y: botY, angle: 0 };
  }
  d -= straightLen;

  // Prawy łuk: dół → góra
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

  // Górna prosta: w prawo → w lewo
  if (d < straightLen) {
    const f = d / straightLen;
    return { x: rightX - f * straightLen * 2, y: topY, angle: Math.PI };
  }
  d -= bendArc;

  // Lewy łuk: góra → dół
  const f = d / bendArc;
  const a = -Math.PI / 2 + f * Math.PI;
  return {
    x: leftX + Math.cos(a) * bendRadius,
    y: centerY + Math.sin(a) * bendRadius,
    angle: a - Math.PI / 2,
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
  return distance <= TRACK.width / 2 - 3;
}

/** Wjazd w bandę (wewnętrzną lub zewnętrzną) = upadek */
function hasHitBarrier(x, y) {
  const { distance } = distanceToCenterline(x, y);
  return distance > TRACK.width / 2 - 3;
}

function getStartPositions(count) {
  const positions = [];
  const baseT = getFinishT();
  const gridOffsets = [-0.012, -0.004, 0.004, 0.012];

  for (let i = 0; i < count; i++) {
    const t = baseT + gridOffsets[i];
    const p = centerlineTangent(t);
    const perpAngle = p.angle - Math.PI / 2;
    const laneOffset = (i - (count - 1) / 2) * 18;
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
  getFinishT,
  trackBounds,
  sampleTrackPoints,
};
