(function () {
  const STORAGE_KEY = 'zuzel-custom-tracks';
  const listEl = document.getElementById('custom-track-list');

  function readCustomTracks() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"tracks":[]}').tracks || [];
    } catch {
      return [];
    }
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function suggestOfficialId(track) {
    const slug = (track.name || track.id || 'official-track')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    return slug.replace(/^custom-/, '') || 'official-track';
  }

  function render() {
    const tracks = readCustomTracks();
    if (!tracks.length) {
      listEl.innerHTML = '<p class="setup-hint">Brak zapisanych torów w tej przeglądarce. Najpierw zapisz tor w <a href="/track-builder.html">edytorze</a>.</p>';
      return;
    }

    listEl.innerHTML = tracks.map((track) => {
      const officialId = suggestOfficialId(track);
      return `
        <div class="promote-track-card panel-inset">
          <strong>${escapeHtml(track.name || track.id)}</strong>
          <span class="setup-hint">ID: ${escapeHtml(track.id)} → oficjalne: <code>${escapeHtml(officialId)}</code></span>
          <div class="builder-actions" style="margin-top: 0.75rem;">
            <button type="button" class="btn primary" data-action="download" data-id="${escapeHtml(track.id)}">Pobierz JSON do importu</button>
          </div>
        </div>`;
    }).join('');

    listEl.querySelectorAll('[data-action="download"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const track = tracks.find((t) => t.id === btn.dataset.id);
        if (!track) return;
        const officialId = suggestOfficialId(track);
        const cmd = document.getElementById('import-command');
        if (cmd) {
          cmd.textContent = `node scripts/import-builtin-track.mjs ${officialId}.json --id ${officialId} --default --locked`;
        }
        downloadJson(`${officialId}.json`, track);
      });
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  render();
})();
