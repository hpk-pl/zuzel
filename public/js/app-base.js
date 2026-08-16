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
})();
