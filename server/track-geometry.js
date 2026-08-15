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
    Math.hypot(px - x2, py - y2),
  );
}

function distanceToStadiumPath(x, y, oval) {
  const { centerX, centerY, straightHalf, bendRadius } = oval;
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

function isInsideStadium(x, y, oval) {
  const { centerX, centerY, straightHalf, bendRadius } = oval;
  const leftX = centerX - straightHalf;
  const rightX = centerX + straightHalf;
  const topY = centerY - bendRadius;
  const botY = centerY + bendRadius;

  if (x >= leftX && x <= rightX && y >= topY && y <= botY) return true;
  if (x > rightX) {
    const dx = x - rightX;
    const dy = y - centerY;
    return dx * dx + dy * dy <= bendRadius * bendRadius;
  }
  if (x < leftX) {
    const dx = x - leftX;
    const dy = y - centerY;
    return dx * dx + dy * dy <= bendRadius * bendRadius;
  }
  return false;
}

function normalizeOval(oval, fallback = {}) {
  return {
    centerX: oval?.centerX ?? fallback.centerX ?? 500,
    centerY: oval?.centerY ?? fallback.centerY ?? 350,
    straightHalf: oval?.straightHalf ?? fallback.straightHalf ?? 220,
    bendRadius: oval?.bendRadius ?? fallback.bendRadius ?? 130,
  };
}

/** Stary format (width) → osobne owale zewnętrzny / wewnętrzny / środek trasy */
function normalizeGeometry(geometry = {}) {
  if (geometry.outer && geometry.inner) {
    const centerline = normalizeOval(
      geometry.centerline,
      normalizeOval(geometry.outer, geometry.inner),
    );
    return {
      outer: normalizeOval(geometry.outer),
      inner: normalizeOval(geometry.inner),
      centerline,
      finishLine: geometry.finishLine || null,
      totalLaps: geometry.totalLaps ?? 4,
      barrierMargin: geometry.barrierMargin ?? 6,
      startLaneSpacing: geometry.startLaneSpacing ?? 23,
    };
  }

  const {
    centerX = 500,
    centerY = 350,
    straightHalf = 220,
    bendRadius = 130,
    width = 176,
    finishLine = null,
    totalLaps = 4,
    barrierMargin = 6,
    startLaneSpacing = 23,
  } = geometry;
  const hw = width / 2;
  const base = { centerX, centerY, straightHalf, bendRadius };

  return {
    outer: { centerX, centerY, straightHalf, bendRadius: bendRadius + hw },
    inner: { centerX, centerY, straightHalf, bendRadius: Math.max(20, bendRadius - hw) },
    centerline: { ...base },
    finishLine,
    totalLaps,
    barrierMargin,
    startLaneSpacing,
  };
}

function traceStadiumOval(ctx, oval) {
  const { centerX, centerY, straightHalf, bendRadius } = oval;
  const leftX = centerX - straightHalf;
  const rightX = centerX + straightHalf;
  const topY = centerY - bendRadius;
  const botY = centerY + bendRadius;

  ctx.moveTo(leftX, topY);
  ctx.lineTo(rightX, topY);
  ctx.arc(rightX, centerY, bendRadius, -Math.PI / 2, Math.PI / 2, false);
  ctx.lineTo(leftX, botY);
  ctx.arc(leftX, centerY, bendRadius, Math.PI / 2, -Math.PI / 2, false);
}

function centerlinePointOnOval(t, oval) {
  const { centerX, centerY, straightHalf, bendRadius } = oval;
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

function averageOval(a, b) {
  return {
    centerX: (a.centerX + b.centerX) / 2,
    centerY: (a.centerY + b.centerY) / 2,
    straightHalf: (a.straightHalf + b.straightHalf) / 2,
    bendRadius: (a.bendRadius + b.bendRadius) / 2,
  };
}

module.exports = {
  distToSegment,
  distToArc,
  distanceToStadiumPath,
  isInsideStadium,
  normalizeOval,
  normalizeGeometry,
  traceStadiumOval,
  centerlinePointOnOval,
  averageOval,
};
