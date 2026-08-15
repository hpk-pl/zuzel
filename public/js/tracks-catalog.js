/** Ładuje katalog torów z tracks.json (geometria + grafika). */
window.TRACK_CATALOG = [];
window.TRACK_BY_ID = {};

window.loadTrackCatalog = function loadTrackCatalog() {
  return fetch('/tracks.json')
    .then((r) => r.json())
    .then((data) => {
      window.TRACK_CATALOG = data.tracks || [];
      window.TRACK_BY_ID = Object.fromEntries(
        window.TRACK_CATALOG.map((track) => [track.id, track])
      );
      return window.TRACK_CATALOG;
    });
};
