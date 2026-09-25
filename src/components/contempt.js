// Contempt: how many centipawns the engine will give up to avoid a draw.
export const CONTEMPT_LIMIT = 100;
export const CONTEMPT_STEP = 10;

export const clampContempt = (cp) =>
  Math.max(-CONTEMPT_LIMIT, Math.min(CONTEMPT_LIMIT, Math.round(cp / CONTEMPT_STEP) * CONTEMPT_STEP));

export function describeContempt(cp) {
  if (cp === 0) return 'neutral';
  return `${cp > 0 ? '+' : '−'}${Math.abs(cp)} cp, ${cp > 0 ? 'avoids draws' : 'seeks draws'}`;
}
