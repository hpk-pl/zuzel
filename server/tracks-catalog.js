const path = require('path');
const catalog = require(path.join(__dirname, '..', 'public', 'tracks.json'));
const { createTrackEngine } = require('./track-engine');

const TRACKS = Object.fromEntries(catalog.tracks.map((t) => [t.id, t]));
const TRACK_IDS = catalog.tracks.map((t) => t.id);
const TRACK_META = Object.fromEntries(catalog.tracks.map((t) => [t.id, { name: t.name }]));

const customTracks = new Map();
const engineCache = new Map();

function isValidTrackId(trackId) {
  return TRACK_IDS.includes(trackId) || customTracks.has(trackId);
}

function normalizeTrackId(trackId) {
  return isValidTrackId(trackId) ? trackId : 'classic';
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

module.exports = {
  TRACK_IDS,
  TRACK_META,
  TRACKS,
  isValidTrackId,
  normalizeTrackId,
  registerCustomTrack,
  getTrackDefinition,
  getTrackGeometry,
  getTrackEngine,
};
