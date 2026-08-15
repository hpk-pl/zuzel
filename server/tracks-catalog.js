const path = require('path');
const catalog = require(path.join(__dirname, '..', 'public', 'tracks.json'));
const { createTrackEngine } = require('./track-engine');

const TRACKS = Object.fromEntries(catalog.tracks.map((t) => [t.id, t]));
const TRACK_IDS = catalog.tracks.map((t) => t.id);
const TRACK_META = Object.fromEntries(catalog.tracks.map((t) => [t.id, { name: t.name }]));

const engineCache = new Map();

function isValidTrackId(trackId) {
  return TRACK_IDS.includes(trackId);
}

function normalizeTrackId(trackId) {
  return isValidTrackId(trackId) ? trackId : 'classic';
}

function getTrackDefinition(trackId) {
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
  getTrackDefinition,
  getTrackGeometry,
  getTrackEngine,
};
