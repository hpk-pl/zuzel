(function () {
  const QUEUE_KEY = 'zuzel_analytics_queue';

  function cfg() {
    return window.PLAYCLUB_CONFIG || {};
  }

  function baseProps() {
    return {
      game: cfg().game || 'zuzel',
      path: location.pathname,
      ts: new Date().toISOString(),
    };
  }

  function sendEvent(event, props = {}) {
    const apiUrl = (typeof window.appPath === 'function' ? window.appPath('/api/events') : '/api/events');
    const payload = { event, props: { ...baseProps(), ...props } };
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        if (navigator.sendBeacon(apiUrl, blob)) return;
      } catch { /* fallback */ }
    }
    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      try {
        const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        q.push(payload);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-50)));
      } catch { /* ignore */ }
    });
  }

  function trackGameView() {
    sendEvent('game_view');
  }

  function trackGameStart(extra = {}) {
    sendEvent('game_start', extra);
  }

  function trackGameComplete(extra = {}) {
    sendEvent('game_complete', extra);
  }

  function trackRematchClick() {
    sendEvent('rematch_click');
  }

  function trackOtherGameClick() {
    sendEvent('other_game_click');
  }

  function trackColorChainzImpression() {
    sendEvent('colorchainz_impression');
  }

  function trackColorChainzClick() {
    sendEvent('colorchainz_click');
  }

  window.PlayClubAnalytics = {
    sendEvent,
    trackGameView,
    trackGameStart,
    trackGameComplete,
    trackRematchClick,
    trackOtherGameClick,
    trackColorChainzImpression,
    trackColorChainzClick,
  };
})();
