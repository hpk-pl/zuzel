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

function writeCustomTracks(tracks) {
  localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify({ tracks }));
}

function mergeCatalog(baseTracks, customTracks) {
  const byId = new Map(baseTracks.map((t) => [t.id, t]));
  for (const track of customTracks) {
    byId.set(track.id, track);
  }
  return [...byId.values()];
}

function applyCatalog(baseTracks, customTracks) {
  window.TRACK_CATALOG = mergeCatalog(baseTracks, customTracks);
  window.TRACK_BY_ID = Object.fromEntries(
    window.TRACK_CATALOG.map((track) => [track.id, track])
  );
  return window.TRACK_CATALOG;
}

function isTrackVisible(track) {
  return track && !track.hidden;
}

function getVisibleTracks(catalog = window.TRACK_CATALOG) {
  return (catalog || []).filter(isTrackVisible);
}

function getDefaultTrackId(catalog = window.TRACK_CATALOG) {
  const visible = getVisibleTracks(catalog);
  if (visible.length) return visible[0].id;
  return 'classic';
}

window.getVisibleTracks = getVisibleTracks;
window.getDefaultTrackId = getDefaultTrackId;

window.loadTrackCatalog = function loadTrackCatalog() {
  return fetch('/tracks.json')
    .then((r) => r.json())
    .then((data) => {
      const base = data.tracks || [];
      const custom = readCustomTracks();
      return applyCatalog(base, custom);
    });
};

window.getCustomTrackDefinition = function getCustomTrackDefinition(trackId) {
  return window.TRACK_BY_ID?.[trackId] || null;
};

window.deleteCustomTrack = function deleteCustomTrack(trackId) {
  const stored = JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY) || '{"tracks":[]}');
  const tracks = stored.tracks || [];
  if (!tracks.some((t) => t.id === trackId)) return false;
  writeCustomTracks(tracks.filter((t) => t.id !== trackId));
  const base = (window.TRACK_CATALOG || []).filter((t) => !t.custom);
  applyCatalog(base, readCustomTracks());
  return true;
};

window.registerRuntimeTrack = function registerRuntimeTrack(definition) {
  if (!definition?.id) return;
  const existing = window.TRACK_BY_ID?.[definition.id];
  const merged = {
    ...(existing || {}),
    ...definition,
    geometry: definition.geometry || existing?.geometry,
    visual: { ...(existing?.visual || {}), ...(definition.visual || {}) },
  };
  if (!merged.image && existing?.image) merged.image = existing.image;
  if (!merged.preview && existing?.preview) merged.preview = existing.preview;
  window.TRACK_BY_ID[definition.id] = merged;
  const idx = window.TRACK_CATALOG.findIndex((t) => t.id === definition.id);
  if (idx >= 0) window.TRACK_CATALOG[idx] = merged;
  else window.TRACK_CATALOG.push(merged);
};
