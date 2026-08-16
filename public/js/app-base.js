/** Wykrywa prefiks ścieżki gry (np. /gry/zuzel) — działa na playclub.pl i zuzel.hpkgrupa.pl. */
(function () {
  function detectBasePath() {
    if (window.__BASE_PATH__ != null) return window.__BASE_PATH__;
    const m = location.pathname.match(/^(\/gry\/zuzel)/);
    return m ? m[1] : '';
  }

  const base = detectBasePath();
  window.__BASE_PATH__ = base;

  window.appPath = function appPath(p) {
    const path = p.startsWith('/') ? p : `/${p}`;
    return `${base}${path}`;
  };

  /** URL zasobu gry (obraz toru itd.) — uwzględnia BASE_PATH. */
  window.resolveAssetUrl = function resolveAssetUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return window.appPath(url);
    return window.appPath(`/${url}`);
  };
})();
