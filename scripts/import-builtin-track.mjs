#!/usr/bin/env node
/**
 * Importuje eksport z edytora torów jako wbudowany tor w repozytorium.
 *
 * Przykład:
 *   node scripts/import-builtin-track.mjs ~/Pobrane/custom-color-chainz.json \
 *     --id color-chainz-stadium --default --locked
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TRACKS_JSON = path.join(ROOT, 'public', 'tracks.json');
const IMG_DIR = path.join(ROOT, 'public', 'img', 'tracks');

function parseArgs(argv) {
  const opts = { default: false, locked: false, id: null };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--default') opts.default = true;
    else if (arg === '--locked') opts.locked = true;
    else if (arg === '--id') opts.id = argv[++i];
    else positional.push(arg);
  }
  if (!positional[0]) {
    console.error('Użycie: node scripts/import-builtin-track.mjs <eksport.json> [--id <id>] [--default] [--locked]');
    process.exit(1);
  }
  opts.input = path.resolve(positional[0]);
  return opts;
}

function normalizeOfficialId(rawId, forcedId) {
  if (forcedId) return forcedId.replace(/^custom-/, '');
  const id = (rawId || 'official-track').replace(/^custom-/, '');
  return id;
}

function writeImageFromDataUrl(dataUrl, trackId) {
  const match = dataUrl.match(/^data:image\/([\w+]+);base64,(.+)$/);
  if (!match) throw new Error('Obraz musi być data URL (base64) — w edytorze użyj „Zapisz do gry” lub „Pobierz JSON” z tłem.');
  const subtype = match[1].toLowerCase();
  const ext = subtype === 'jpeg' || subtype === 'jpg' ? 'jpg' : subtype.replace('jpeg', 'jpg');
  const outPath = path.join(IMG_DIR, `${trackId}.${ext}`);
  fs.mkdirSync(IMG_DIR, { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(match[2], 'base64'));
  return `/img/tracks/${trackId}.${ext}`;
}

function buildEntry(exportData, opts) {
  const id = normalizeOfficialId(exportData.id, opts.id);
  if (!exportData.geometry) throw new Error('Brak geometry w eksporcie.');

  let imagePath = exportData.image;
  let previewPath = exportData.preview || exportData.image;
  if (typeof imagePath === 'string' && imagePath.startsWith('data:')) {
    imagePath = writeImageFromDataUrl(imagePath, id);
    previewPath = imagePath;
  } else if (typeof imagePath === 'string' && !imagePath.startsWith('/')) {
    throw new Error(`Nieobsługiwana ścieżka obrazu: ${imagePath}. Użyj eksportu z edytora (base64) lub podaj /img/tracks/...`);
  }

  const visual = { ...(exportData.visual || {}), showVectorLayer: false };
  if (imagePath) {
    visual.mode = 'image';
    if (!visual.fit) visual.fit = 'cover';
  }

  const entry = {
    id,
    name: exportData.name || id,
    description: exportData.description || '',
    preview: previewPath || null,
    image: imagePath || null,
    geometry: exportData.geometry,
    visual,
  };
  if (opts.default) entry.default = true;
  if (opts.locked) entry.locked = true;
  return entry;
}

function upsertTrack(catalog, entry) {
  const tracks = catalog.tracks || [];
  const idx = tracks.findIndex((t) => t.id === entry.id);
  if (idx >= 0) tracks[idx] = { ...tracks[idx], ...entry };
  else tracks.push(entry);
  catalog.tracks = tracks;
  return catalog;
}

const opts = parseArgs(process.argv.slice(2));
const exportData = JSON.parse(fs.readFileSync(opts.input, 'utf8'));
const entry = buildEntry(exportData, opts);
const catalog = JSON.parse(fs.readFileSync(TRACKS_JSON, 'utf8'));
fs.writeFileSync(TRACKS_JSON, `${JSON.stringify(upsertTrack(catalog, entry), null, 2)}\n`);

console.log(`Zaimportowano tor „${entry.name}” (${entry.id})`);
if (entry.default) console.log('  → ustawiony jako domyślny');
if (entry.locked) console.log('  → zablokowany (bez edycji)');
console.log(`  → wpis w public/tracks.json`);
if (entry.image) console.log(`  → obraz: ${entry.image}`);
