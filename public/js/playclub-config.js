/** Konfiguracja PlayClub — most do sklepu, UTM, limity CTA. */
window.PLAYCLUB_CONFIG = {
  game: 'zuzel',
  homeUrl: '/',
  shop: {
    baseUrl: 'https://colorchainz.pl/kategoria/zuzel',
    ctaLabel: 'Wear your colors →',
    poweredBy: 'Matchday powered by COLORCHAINZ',
    utm: {
      source: 'playclub',
      medium: 'game',
      campaign: 'zuzel-postmatch',
    },
  },
  bridge: {
    /** Pełne CTA co N zakończonych meczów (subtelny „powered by” zawsze). */
    ctaEveryNMatches: 3,
    storageKey: 'zuzel_playclub_bridge',
  },
};
