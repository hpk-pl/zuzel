const path = require('path');
const catalog = require(path.join(__dirname, '..', 'public', 'tracks.json'));
const { createTrackEngine } = require('./track-engine');

const TRACKS = Object.fromEntries(catalog.tracks.map((t) => [t.id, t]));
const TRACK_IDS = catalog.tracks.map((t) => t.id);
const TRACK_META = Object.fromEntries(catalog.tracks.map((t) => [t.id, { name: t.name }]));
const DEFAULT_TRACK_ID = catalog.tracks.find((t) => t.default && !t.hidden)?.id
  || catalog.tracks.find((t) => !t.hidden)?.id
  || 'classic';

const customTracks = new Map();
const engineCache = new Map();

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
  registerCustomTrack,
  getTrackDefinition,
  getTrackGeometry,
  getTrackEngine,
  stripTrackForState,
};
