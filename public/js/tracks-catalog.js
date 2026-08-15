/** Ładuje katalog torów z tracks.json + własne tory z localStorage. */
const CUSTOM_STORAGE_KEY = 'zuzel-custom-tracks';

window.TRACK_CATALOG = [];
window.TRACK_BY_ID = {};

function readCustomTracks() {
  try {
    const data = JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY) || '{"tracks":[]}');
    return (data.tracks || []).map((track) => ({ ...track, custom: true }));
  } catch {
    return [];
  }
}

function mergeCatalog(baseTracks, customTracks) {
  const byId = new Map(baseTracks.map((t) => [t.id, t]));
  for (const track of customTracks) {
    byId.set(track.id, track);
  }
  return [...byId.values()];
}

window.loadTrackCatalog = function loadTrackCatalog() {
  return fetch('/tracks.json')
    .then((r) => r.json())
    .then((data) => {
      const base = data.tracks || [];
      const custom = readCustomTracks();
      window.TRACK_CATALOG = mergeCatalog(base, custom);
      window.TRACK_BY_ID = Object.fromEntries(
        window.TRACK_CATALOG.map((track) => [track.id, track])
      );
      return window.TRACK_CATALOG;
    });
};

window.getCustomTrackDefinition = function getCustomTrackDefinition(trackId) {
  return window.TRACK_BY_ID?.[trackId] || null;
};

window.registerRuntimeTrack = function registerRuntimeTrack(definition) {
  if (!definition?.id) return;
  window.TRACK_BY_ID[definition.id] = definition;
  const idx = window.TRACK_CATALOG.findIndex((t) => t.id === definition.id);
  if (idx >= 0) window.TRACK_CATALOG[idx] = definition;
  else window.TRACK_CATALOG.push(definition);
};
