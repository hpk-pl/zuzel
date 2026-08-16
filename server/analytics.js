const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EVENTS_PATH = path.join(DATA_DIR, 'events.jsonl');

const ALLOWED_EVENTS = new Set([
  'game_view',
  'game_start',
  'game_complete',
  'rematch_click',
  'other_game_click',
  'colorchainz_impression',
  'colorchainz_click',
]);

function recordEvent({ event, props = {} } = {}) {
  if (!event || !ALLOWED_EVENTS.has(event)) return false;
  const row = {
    event,
    props: typeof props === 'object' && props ? props : {},
    receivedAt: new Date().toISOString(),
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(EVENTS_PATH, `${JSON.stringify(row)}\n`);
  return true;
}

module.exports = {
  recordEvent,
  ALLOWED_EVENTS,
};
