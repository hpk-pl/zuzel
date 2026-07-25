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
    return { x: leftX + f * straightLen * 2, y: botY, angle: 0 };
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
    return { x: rightX - f * straightLen * 2, y: topY, angle: Math.PI };
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

function hasHitBarrier(x, y) {
  const { distance } = distanceToCenterline(x, y);
  return distance > TRACK.width / 2 - 4;
}

/** Wszyscy na linii startu — rozstawienie prostopadle do toru */
function getStartPositions(count) {
  const positions = [];
  const baseT = getFinishT();
  const p = centerlineTangent(baseT);
  const perpAngle = p.angle - Math.PI / 2;

  for (let i = 0; i < count; i++) {
    const laneOffset = (i - (count - 1) / 2) * 22;
    positions.push({
      x: p.x + Math.cos(perpAngle) * laneOffset,
      y: p.y + Math.sin(perpAngle) * laneOffset,
      angle: p.angle,
    });
  }
  return positions;
}

module.exports = {
  TRACK,
  TOTAL_HEATS,
  HEAT_POINTS,
  centerlinePoint,
  centerlineTangent,
  distanceToCenterline,
  hasHitBarrier,
  getStartPositions,
  getFinishT,
};
