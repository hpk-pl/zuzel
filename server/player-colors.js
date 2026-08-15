/** Kolory wyboru gracza — zsynchronizowane z public/js/player-colors.js */
const PICKABLE_COLORS = [
  '#FF2D55',
  '#FF9500',
  '#FFCC00',
  '#30D158',
  '#00D4FF',
  '#007AFF',
  '#BF5AF2',
  '#FF6B35',
];

const PLAYER_COLORS = {
  0: PICKABLE_COLORS[0],
  1: PICKABLE_COLORS[1],
  2: PICKABLE_COLORS[2],
  3: PICKABLE_COLORS[3],
};

module.exports = { PICKABLE_COLORS, PLAYER_COLORS };
