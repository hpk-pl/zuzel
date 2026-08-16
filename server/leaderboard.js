const fs = require('fs');
const path = require('path');
const { formatRaceTime } = require('./race-time');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'leaderboard.json');
const MAX_STORED_PER_TRACK = 200;
const MIN_TIME_MS = 3000;
const MAX_TIME_MS = 10 * 60 * 1000;

function sanitizeName(name) {
  return String(name || '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, 16);
}

function normalizeNameKey(name) {
  return sanitizeName(name).toLowerCase();
}

function loadStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return { tracks: {} };
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return raw?.tracks ? raw : { tracks: {} };
  } catch {
    return { tracks: {} };
  }
}

function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`);
}

function toPublicEntry(entry, rank) {
  return {
    rank,
    name: entry.name,
    timeMs: entry.timeMs,
    time: formatRaceTime(entry.timeMs),
    speedPercent: entry.speedPercent ?? 100,
    at: entry.at,
  };
}

function getTopEntries(trackId, limit = 20) {
  const store = loadStore();
  const list = (store.tracks[trackId] || [])
    .slice()
    .sort((a, b) => a.timeMs - b.timeMs || String(a.at).localeCompare(String(b.at)));
  return list.slice(0, limit).map((e, i) => toPublicEntry(e, i + 1));
}

function isTopN(timeMs, trackId, n = 20) {
  const top = getTopEntries(trackId, n);
  if (top.length < n) return true;
  return timeMs < top[top.length - 1].timeMs;
}

/**
 * Zapisuje czasy finiszujących z biegu. Zwraca mapę slot → { saved, rank, isTop20 }.
 * @param {{ trackId: string, results: Array<{slot,name,timeMs,speedPercent,label}> }} payload
 */
function submitHeatResults({ trackId, results = [] } = {}) {
  if (!trackId) return {};

  const store = loadStore();
  if (!store.tracks[trackId]) store.tracks[trackId] = [];

  const bySlot = {};
  const list = store.tracks[trackId];

  for (const r of results) {
    if (!r || r.label === 'u' || r.timeMs == null) continue;
    if (r.timeMs < MIN_TIME_MS || r.timeMs > MAX_TIME_MS) continue;

    const name = sanitizeName(r.name);
    if (!name) continue;

    const key = normalizeNameKey(name);
    const entry = {
      name,
      timeMs: Math.round(r.timeMs),
      speedPercent: r.speedPercent ?? 100,
      at: new Date().toISOString(),
    };

    const existingIdx = list.findIndex((e) => normalizeNameKey(e.name) === key);
    const wasTop20Before = existingIdx >= 0
      ? isTopN(list[existingIdx].timeMs, trackId, 20)
      : isTopN(entry.timeMs, trackId, 20);

    if (existingIdx >= 0) {
      if (entry.timeMs >= list[existingIdx].timeMs) {
        bySlot[r.slot] = { saved: false, improved: false, isTop20: wasTop20Before };
        continue;
      }
      list[existingIdx] = entry;
    } else {
      list.push(entry);
    }

    list.sort((a, b) => a.timeMs - b.timeMs || String(a.at).localeCompare(String(b.at)));
    store.tracks[trackId] = list.slice(0, MAX_STORED_PER_TRACK);
    saveStore(store);

    const rank = getTopEntries(trackId, 200).findIndex((e) => normalizeNameKey(e.name) === key) + 1;
    bySlot[r.slot] = {
      saved: true,
      improved: true,
      rank: rank > 0 ? rank : null,
      isTop20: rank > 0 && rank <= 20,
    };
  }

  return bySlot;
}

module.exports = {
  getTopEntries,
  submitHeatResults,
  formatRaceTime,
};
