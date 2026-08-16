/** Formatuje czas biegu (ms → "45.2 s" lub "1:23.4"). */
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

function formatHeatResultRow(r) {
  const timePart = r.timeMs != null ? formatRaceTime(r.timeMs) : '—';
  const speedPart = r.speedPercent != null && r.speedPercent !== 100 ? ` · ${r.speedPercent}%` : '';
  let badge = '';
  if (r.leaderboard?.isTop20) badge = ' <span class="lb-badge">Top 20!</span>';
  else if (r.leaderboard?.saved) badge = ' <span class="lb-badge lb-badge-personal">Rekord!</span>';
  return `<div class="heat-result-row" style="color:${r.color}">${escapeHtml(r.name)}: <strong>${r.label}</strong> → ${r.points} pkt · <span class="heat-time">${timePart}</span>${speedPart}${badge}</div>`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

window.formatRaceTime = formatRaceTime;
window.formatHeatResultRow = formatHeatResultRow;
