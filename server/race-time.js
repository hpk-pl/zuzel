/** Formatuje czas biegu w sekundach (ms → "45.2 s" lub "1:23.4"). */
function formatRaceTime(timeMs) {
  if (timeMs == null || !Number.isFinite(timeMs) || timeMs < 0) return '—';
  const totalSec = timeMs / 1000;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes > 0) {
    const secStr = seconds < 10 ? `0${seconds.toFixed(1)}` : seconds.toFixed(1);
    return `${minutes}:${secStr}`;
  }
  return `${seconds.toFixed(1)} s`;
}

function calcFinisherTimeMs(bike, heatStartTime) {
  if (!bike?.finished || !bike.finishTime || !heatStartTime) return null;
  const ms = bike.finishTime - heatStartTime;
  return ms > 0 ? ms : null;
}

module.exports = {
  formatRaceTime,
  calcFinisherTimeMs,
};
