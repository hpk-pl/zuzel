const START_LANES = 4;
const {
  normalizeGeometry,
  distanceToStadiumPath,
  isInsideStadium,
  centerlinePointOnOval,
  getFinishLineSegment,
} = require('./track-geometry');

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Fabryka silnika toru — osobne owale zewnętrzny / wewnętrzny + środek trasy */
function createTrackEngine(geometry) {
  const geo = normalizeGeometry(geometry);

  function trackLength() {
    const { straightHalf, bendRadius } = geo.centerline;
    const straightLen = straightHalf * 2;
    return 2 * straightLen + 2 * Math.PI * bendRadius;
  }

  function getFinishT() {
    if (geo.finishLine) {
      const { x1, y1, x2, y2 } = geo.finishLine;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      let bestT = 0;
      let best = Infinity;
      for (let i = 0; i <= 240; i++) {
        const t = i / 240;
        const p = centerlinePoint(t);
        const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
        if (d < best) { best = d; bestT = t; }
      }
      return bestT;
    }
    const straightLen = geo.centerline.straightHalf * 2;
    return (straightLen / 2) / trackLength();
  }

  function centerlinePoint(t) {
    return centerlinePointOnOval(t, geo.centerline);
  }

  function distanceFromCenterline(x, y) {
    return distanceToStadiumPath(x, y, geo.centerline);
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
    const m = geo.barrierMargin;
    const inOuter = isInsideStadium(x, y, geo.outer);
    const inInner = isInsideStadium(x, y, geo.inner);
    if (!inOuter) return true;
    if (inInner) return true;
    if (distanceToStadiumPath(x, y, geo.outer) < m) return true;
    if (distanceToStadiumPath(x, y, geo.inner) < m) return true;
    return false;
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
    const fl = getFinishLineSegment(geo);
    const dx = fl.x2 - fl.x1;
    const dy = fl.y2 - fl.y1;
    const lineLen = Math.hypot(dx, dy) || 1;
    const laneIndices = shuffleArray([...Array(START_LANES).keys()]).slice(0, riders.length);
    const bikeClearance = 14;
    const endMargin = geo.barrierMargin + bikeClearance;
    const usable = Math.max(24, lineLen - endMargin * 2);

    return riders.map((rider, i) => {
      const lane = laneIndices[i];
      const laneFrac = (lane + 0.5) / START_LANES;
      const along = endMargin + usable * laneFrac;
      const t = along / lineLen;
      let x = fl.x1 + dx * t;
      let y = fl.y1 + dy * t;

      if (hasHitBarrier(x, y)) {
        const steps = 12;
        for (let s = 1; s <= steps; s++) {
          const tt = t + (0.5 - t) * (s / steps);
          const nx = fl.x1 + dx * tt;
          const ny = fl.y1 + dy * tt;
          if (!hasHitBarrier(nx, ny)) { x = nx; y = ny; break; }
        }
      }

      return {
        slot: rider.slot,
        lane,
        x,
        y,
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
