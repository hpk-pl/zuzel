/** Wykrywa prefiks ścieżki gry (np. /gry/zuzel) — działa na playclub.pl i zuzel.hpkgrupa.pl. */
(function () {
  function detectBasePath() {
    if (window.__BASE_PATH__ != null) return window.__BASE_PATH__;
    const m = location.pathname.match(/^(\/gry\/zuzel)/);
    return m ? m[1] : '';
  }

  const base = detectBasePath();
  window.__BASE_PATH__ = base;

  function withBase(path) {
    const p = path.startsWith('/') ? path : `/${path}`;
    if (!base) return p;
    if (p === base || p.startsWith(`${base}/`)) return p;
    return `${base}${p}`;
  }

  window.appPath = function appPath(p) {
    return withBase(p);
  };

  /** URL zasobu gry (obraz toru itd.) — uwzględnia BASE_PATH, idempotentne. */
  window.resolveAssetUrl = function resolveAssetUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return url;
    return withBase(url.startsWith('/') ? url : `/${url}`);
  };
})();
