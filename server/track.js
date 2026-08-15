/**
 * Kompatybilność wsteczna — domyślny tor klasyczny.
 * Nowe tory: public/tracks.json + getTrackEngine(trackId).
 */

const { getTrackEngine, getTrackGeometry } = require('./tracks-catalog');

const DEFAULT_ENGINE = getTrackEngine('classic');
const TRACK = DEFAULT_ENGINE.geometry;

const TOTAL_HEATS = 15;
const HEAT_POINTS = [3, 2, 1, 0];

module.exports = {
  TRACK,
  TOTAL_HEATS,
  HEAT_POINTS,
  createTrackEngine: require('./track-engine').createTrackEngine,
  centerlinePoint: (...args) => DEFAULT_ENGINE.centerlinePoint(...args),
  distanceToCenterline: (...args) => DEFAULT_ENGINE.distanceToCenterline(...args),
  hasHitBarrier: (...args) => DEFAULT_ENGINE.hasHitBarrier(...args),
  bikeHitsBarrier: (...args) => DEFAULT_ENGINE.bikeHitsBarrier(...args),
  getStartPositions: (...args) => DEFAULT_ENGINE.getStartPositions(...args),
  getFinishT: (...args) => DEFAULT_ENGINE.getFinishT(...args),
  getTrackGeometry,
};
