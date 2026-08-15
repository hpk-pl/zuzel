const fs = require('fs');
const path = require('path');
const { createTrackEngine } = require('./track-engine');

const CATALOG_PATH = path.join(__dirname, '..', 'public', 'tracks.json');

const customTracks = new Map();
const engineCache = new Map();

let catalog = loadCatalogFromDisk();
let TRACKS = buildTracksMap(catalog);
let TRACK_IDS = catalog.tracks.map((t) => t.id);
let TRACK_META = Object.fromEntries(catalog.tracks.map((t) => [t.id, { name: t.name }]));
let DEFAULT_TRACK_ID = resolveDefaultTrackId(catalog);

function loadCatalogFromDisk() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

function buildTracksMap(nextCatalog) {
  return Object.fromEntries(nextCatalog.tracks.map((t) => [t.id, t]));
}

function resolveDefaultTrackId(nextCatalog) {
  return nextCatalog.tracks.find((t) => t.default && !t.hidden)?.id
    || nextCatalog.tracks.find((t) => !t.hidden)?.id
    || 'classic';
}

function reloadCatalog({ clearEngines = true } = {}) {
  catalog = loadCatalogFromDisk();
  TRACKS = buildTracksMap(catalog);
  TRACK_IDS = catalog.tracks.map((t) => t.id);
  TRACK_META = Object.fromEntries(catalog.tracks.map((t) => [t.id, { name: t.name }]));
  DEFAULT_TRACK_ID = resolveDefaultTrackId(catalog);
  if (clearEngines) engineCache.clear();
}

function isValidTrackId(trackId) {
  return TRACK_IDS.includes(trackId) || customTracks.has(trackId);
}

function normalizeTrackId(trackId) {
  return isValidTrackId(trackId) ? trackId : DEFAULT_TRACK_ID;
}

function getDefaultTrackId() {
  return DEFAULT_TRACK_ID;
}

function isLockedTrackId(trackId) {
  return Boolean(TRACKS[trackId]?.locked);
}

function registerCustomTrack(definition) {
  if (!definition?.id || !definition?.geometry) return false;
  customTracks.set(definition.id, definition);
  engineCache.delete(definition.id);
  return true;
}

function getTrackDefinition(trackId) {
  if (customTracks.has(trackId)) return customTracks.get(trackId);
  return TRACKS[normalizeTrackId(trackId)];
}

function getTrackGeometry(trackId) {
  return getTrackDefinition(trackId).geometry;
}

function getTrackEngine(trackId) {
  const id = normalizeTrackId(trackId);
  if (!engineCache.has(id)) {
    engineCache.set(id, createTrackEngine(getTrackGeometry(id)));
  }
  return engineCache.get(id);
}

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

/** Usuwa ciężkie base64 z synchronizacji stanu (obraz zostaje u klienta). */
function stripTrackForState(definition, { includeImages = false } = {}) {
  if (!definition) return null;
  if (includeImages) return definition;
  return {
    ...definition,
    image: isDataUrl(definition.image) ? null : definition.image,
    preview: isDataUrl(definition.preview) ? null : definition.preview,
  };
}

module.exports = {
  TRACK_IDS,
  TRACK_META,
  TRACKS,
  DEFAULT_TRACK_ID,
  isValidTrackId,
  normalizeTrackId,
  getDefaultTrackId,
  isLockedTrackId,
  reloadCatalog,
  registerCustomTrack,
  getTrackDefinition,
  getTrackGeometry,
  getTrackEngine,
  stripTrackForState,
};
