const TRACK_IDS = ['classic', 'leszno'];

const TRACK_META = {
  classic: { name: 'Tor klasyczny' },
  leszno: { name: 'Leszno' },
};

function isValidTrackId(trackId) {
  return TRACK_IDS.includes(trackId);
}

function normalizeTrackId(trackId) {
  return isValidTrackId(trackId) ? trackId : 'classic';
}

module.exports = { TRACK_IDS, TRACK_META, isValidTrackId, normalizeTrackId };
