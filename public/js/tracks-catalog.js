/** Katalog torów — wspólna konfiguracja wizualna (klient). */
window.TRACK_CATALOG = [
  {
    id: 'classic',
    name: 'Tor klasyczny',
    description: 'Domyślny owal treningowy',
    preview: null,
    visual: {
      mode: 'procedural',
      palette: 'classic',
    },
  },
  {
    id: 'leszno',
    name: 'Leszno',
    description: 'Stadion im. Alfreda Smoczyka · Unia Leszno',
    preview: '/img/tracks/leszno.jpg',
    image: '/img/tracks/leszno.jpg',
    visual: {
      mode: 'image',
      fit: 'cover',
      fallbackPalette: 'leszno',
      showFinishLine: true,
      finishLineOpacity: 0.85,
    },
  },
];

window.TRACK_BY_ID = Object.fromEntries(
  window.TRACK_CATALOG.map((track) => [track.id, track])
);
