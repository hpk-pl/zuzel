const path = require('path');

/** Prefiks URL gry, np. /gry/zuzel (pusty = root, jak zuzel.hpkgrupa.pl). */
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/$/, '');

const publicDir = path.join(__dirname, '..', 'public');
const lobbyDir = path.join(publicDir, 'lobby');

function gamePath(subpath = '') {
  const suffix = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return `${BASE_PATH}${suffix}` || suffix;
}

module.exports = {
  BASE_PATH,
  publicDir,
  lobbyDir,
  gamePath,
};
