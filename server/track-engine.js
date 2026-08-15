const START_LANES = 4;

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

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Fabryka silnika toru — osobna geometria (bandy, środek) per stadion */
function createTrackEngine(geometry) {
  const geo = {
    centerX: geometry.centerX,
    centerY: geometry.centerY,
    straightHalf: geometry.straightHalf,
    bendRadius: geometry.bendRadius,
    width: geometry.width,
    totalLaps: geometry.totalLaps ?? 4,
    barrierMargin: geometry.barrierMargin ?? 6,
    startLaneSpacing: geometry.startLaneSpacing ?? 23,
  };

  function trackLength() {
    const straightLen = geo.straightHalf * 2;
    return 2 * straightLen + 2 * Math.PI * geo.bendRadius;
  }

  function getFinishT() {
    const straightLen = geo.straightHalf * 2;
    return (straightLen / 2) / trackLength();
  }

  function centerlinePoint(t) {
    const { centerX, centerY, straightHalf, bendRadius } = geo;
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

  function distanceFromCenterline(x, y) {
    const { centerX, centerY, straightHalf, bendRadius } = geo;
    const leftX = centerX - straightHalf;
    const rightX = centerX + straightHalf;
    const topY = centerY - bendRadius;
    const botY = centerY + bendRadius;

    return Math.min(
      distToSegment(x, y, leftX, botY, rightX, botY),
      distToSegment(x, y, rightX, topY, leftX, topY),
      distToArc(x, y, rightX, centerY, bendRadius, -Math.PI / 2, Math.PI / 2),
      distToArc(x, y, leftX, centerY, bendRadius, Math.PI / 2, (3 * Math.PI) / 2),
    );
  }

  function distanceToCenterline(x, y) {
    const distance = distanceFromCenterline(x, y);
    let bestT = 0;
    let best = Infinity;
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const p = centerlinePoint(t);
      const d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d < best) { best = d; bestT = t; }
    }
    return { distance, t: bestT };
  }

  function hasHitBarrier(x, y) {
    return distanceFromCenterline(x, y) > geo.width / 2 - geo.barrierMargin;
  }

  function bikeHitsBarrier(x, y, angle) {
    if (hasHitBarrier(x, y)) return true;
    const frontX = x + Math.cos(angle) * 12;
    const frontY = y + Math.sin(angle) * 12;
    return hasHitBarrier(frontX, frontY);
  }

  function getStartPositions(riders) {
    const baseT = getFinishT();
    const p = centerlinePoint(baseT);
    const perpAngle = p.angle - Math.PI / 2;
    const laneIndices = shuffleArray([...Array(START_LANES).keys()]).slice(0, riders.length);

    return riders.map((rider, i) => {
      const lane = laneIndices[i];
      const laneOffset = (lane - (START_LANES - 1) / 2) * geo.startLaneSpacing;
      return {
        slot: rider.slot,
        lane,
        x: p.x + Math.cos(perpAngle) * laneOffset,
        y: p.y + Math.sin(perpAngle) * laneOffset,
        angle: p.angle,
      };
    });
  }

  return {
    geometry: geo,
    trackLength,
    getFinishT,
    centerlinePoint,
    distanceFromCenterline,
    distanceToCenterline,
    hasHitBarrier,
    bikeHitsBarrier,
    getStartPositions,
  };
}

module.exports = { createTrackEngine, START_LANES };
