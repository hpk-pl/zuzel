(function () {
  function cfg() {
    return window.PLAYCLUB_CONFIG || {};
  }

  function bridgeCfg() {
    return cfg().bridge || {};
  }

  function shopCfg() {
    return cfg().shop || {};
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(bridgeCfg().storageKey || 'zuzel_playclub_bridge') || '{}');
    } catch {
      return {};
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(bridgeCfg().storageKey || 'zuzel_playclub_bridge', JSON.stringify(state));
    } catch { /* ignore */ }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function getShopUrl() {
    const shop = shopCfg();
    const url = new URL(shop.baseUrl || 'https://colorchainz.pl');
    const utm = shop.utm || {};
    if (utm.source) url.searchParams.set('utm_source', utm.source);
    if (utm.medium) url.searchParams.set('utm_medium', utm.medium);
    if (utm.campaign) url.searchParams.set('utm_campaign', utm.campaign);
    return url.toString();
  }

  function shouldShowCtaOnNextMatchEnd() {
    const every = bridgeCfg().ctaEveryNMatches ?? 3;
    const count = (loadState().matchEnds || 0) + 1;
    return count === 1 || count % every === 0;
  }

  function recordMatchEndAnalytics(summary) {
    const showCta = shouldShowCtaOnNextMatchEnd();
    const state = loadState();
    state.matchEnds = (state.matchEnds || 0) + 1;
    saveState(state);
    if (showCta) window.PlayClubAnalytics?.trackColorChainzImpression();
    window.PlayClubAnalytics?.trackGameComplete({
      winner: summary?.winner,
      scoreA: summary?.teamA?.points,
      scoreB: summary?.teamB?.points,
    });
    return showCta;
  }

  function getBridgeHtml(showCta) {
    const shop = shopCfg();
    const poweredBy = shop.poweredBy || 'Matchday powered by COLORCHAINZ';
    const cta = showCta
      ? `<a class="shop-bridge-cta" id="overlay-shop-link" href="${getShopUrl()}" target="_blank" rel="noopener noreferrer">${escapeHtml(shop.ctaLabel || 'Wear your colors →')}</a>`
      : '';
    const poweredHtml = escapeHtml(poweredBy).replace('COLORCHAINZ', '<strong>COLORCHAINZ</strong>');
    return `
      <div class="shop-bridge">
        <p class="shop-bridge-powered">${poweredHtml}</p>
        ${cta}
      </div>`;
  }

  function buildWinText(summary) {
    if (!summary) return '';
    if (summary.winner === 'draw') return 'Remis!';
    const name = summary.winner === 'A' ? summary.teamA?.name : summary.teamB?.name;
    return `🏆 ${escapeHtml(name || 'Wygrana!')}`;
  }

  function buildWaitHint({ canStartNewGame, isHost, hostName }) {
    if (canStartNewGame) {
      if (isHost) return '<p class="overlay-wait-host overlay-wait-host--host">Jesteś hostem — kliknij <strong>Nowa gra</strong>, aby zacząć od nowa.</p>';
      return '';
    }
    if (hostName) {
      return `<p class="overlay-wait-host">Poproś <strong>${escapeHtml(hostName)}</strong> o nową grę (przycisk u hosta).</p>`;
    }
    return '<p class="overlay-wait-host">Host opuścił pokój — poczekaj, aż ktoś zostanie hostem, lub wróć do menu.</p>';
  }

  function buildMatchEndOverlayHtml({
    summary,
    showRematch,
    canStartNewGame = true,
    isHost = false,
    hostName = '',
    playersHtml = '',
    showCta = false,
  }) {
    const s = summary;
    const winText = buildWinText(s);
    const rematchBtn = showRematch
      ? '<button type="button" id="overlay-reset" class="btn primary overlay-btn">Rewanż</button>'
      : '';
    const newGameAttrs = canStartNewGame
      ? ''
      : ' disabled title="Tylko host może rozpocząć nową grę"';
    const newGameBtn = `<button type="button" id="overlay-new-game" class="btn overlay-btn"${newGameAttrs}>Nowa gra</button>`;
    const waitHint = buildWaitHint({ canStartNewGame, isHost, hostName });
    return `
      <div class="overlay-title">🏁 Koniec meczu!</div>
      <div class="winner">${winText}</div>
      <div class="final-score">${escapeHtml(s.teamA?.name || 'A')} ${s.teamA?.points ?? 0} : ${s.teamB?.points ?? 0} ${escapeHtml(s.teamB?.name || 'B')}</div>
      ${playersHtml}
      <div class="overlay-actions">
        ${rematchBtn}
        ${newGameBtn}
      </div>
      ${waitHint}
      ${getBridgeHtml(showCta)}`;
  }

  function handleOverlayClick(e) {
    if (e.target.id === 'overlay-shop-link') {
      window.PlayClubAnalytics?.trackColorChainzClick();
    }
    if (e.target.id === 'overlay-reset' || e.target.id === 'overlay-new-game') {
      window.PlayClubAnalytics?.trackRematchClick();
    }
  }

  window.PlayClubBridge = {
    getShopUrl,
    getBridgeHtml,
    buildMatchEndOverlayHtml,
    recordMatchEndAnalytics,
    handleOverlayClick,
  };
})();
