// Scores are centipawns from White's side. The search reports a forced mate as
// ±(20000 − plies to mate), so anything past MATE_BOUND is a mate, not material.
export const MATE_SCORE = 20000;
const MATE_BOUND = 15000;

export const isMate = (score) => Math.abs(score) > MATE_BOUND;

// Full moves for the winning side to deliver mate.
export const mateIn = (score) => Math.ceil((MATE_SCORE - Math.abs(score)) / 2);

// "M3" for a mate, "1.2" for material; `sign` prefixes + or − for the leading side.
export function formatScore(score, { sign = false, decimals = 2 } = {}) {
  const lead = !sign || score === 0 ? '' : score > 0 ? '+' : '−';
  if (isMate(score)) return mateIn(score) === 0 ? '#' : `${lead}M${mateIn(score)}`;
  return `${lead}${(Math.abs(score) / 100).toFixed(decimals)}`;
}
