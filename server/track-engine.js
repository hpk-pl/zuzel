const START_LANES = 4;
const {
  normalizeGeometry,
  distanceToStadiumPath,
  isInsideStadium,
  centerlinePointOnOval,
  getFinishLineSegment,
} = require('./track-geometry');

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

  function isValidStartPose(x, y, angle) {
    if (bikeHitsBarrier(x, y, angle)) return false;
    const probe = 0.2;
    return !bikeHitsBarrier(
      x + Math.cos(angle) * probe,
      y + Math.sin(angle) * probe,
      angle,
    );
  }

  function getStartPositions(riders) {
    const baseT = getFinishT();
    const p = centerlinePoint(baseT);
    const fl = getFinishLineSegment(geo);
    const dx = fl.x2 - fl.x1;
    const dy = fl.y2 - fl.y1;
    const lineLen = Math.hypot(dx, dy) || 1;
    const sortedRiders = [...riders].sort((a, b) => a.slot - b.slot);
    const bikeClearance = 14;
    const endMargin = geo.barrierMargin + bikeClearance;
    const usable = Math.max(24, lineLen - endMargin * 2);

    return sortedRiders.map((rider, i) => {
      const laneFrac = (i + 0.5) / sortedRiders.length;
      const along = endMargin + usable * laneFrac;
      const t = along / lineLen;
      let x = fl.x1 + dx * t;
      let y = fl.y1 + dy * t;

      if (!isValidStartPose(x, y, p.angle)) {
        const steps = 24;
        for (let s = 0; s <= steps; s += 1) {
          const tt = s / steps;
          const nx = fl.x1 + dx * tt;
          const ny = fl.y1 + dy * tt;
          if (isValidStartPose(nx, ny, p.angle)) {
            x = nx;
            y = ny;
            break;
          }
        }
      }

      return {
        slot: rider.slot,
        lane: i,
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
