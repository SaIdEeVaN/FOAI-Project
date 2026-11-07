// ── Evaluation parameters ─────────────────────────────────────────────────
// Every number the evaluation uses has a middlegame and an endgame value; the
// evaluation blends the two by how much material is left (see PHASE_MAX).
//
// The weights live in weights.js as one readable object per phase. The tuner
// (bench/tune.js) works on them as a flat vector, in the order laid out here,
// and Evaluation.features() reports a position in the same order, so that
//
//   evaluate(position) ≈ Σ features[i] · (mg[i]·phase + eg[i]·(24 − phase)) / 24
//
// which is what makes the evaluation linear in its weights and lets them be
// fitted by logistic regression.

export const PIECE_TYPES = 'PNBRQK';

// Game phase: 24 with every piece on the board, 0 with only kings and pawns.
export const PHASE_MAX = 24;
export const PHASE_WEIGHT = { N: 1, B: 1, R: 2, Q: 4, n: 1, b: 1, r: 2, q: 4 };

// The flat order. Each entry is [name, size].
const LAYOUT = [
  ['pieceValue', 6],   // By piece type, PNBRQK; the king's is fixed at 0
  ['pst', 6 * 64],     // By piece type, then square from White's side (a8 = 0)
  ['doubled', 1],      // Per pawn on a file holding more than one of its colour
  ['isolated', 1],     // Per pawn with no friendly pawn on either neighbouring file
  ['passed', 8],       // Per passed pawn, by rank counted from its own side (0–7)
  ['bishopPair', 1],   // Two or more bishops
  ['rookOpen', 1],     // Rook on a file with no pawns
  ['rookSemiOpen', 1], // Rook on a file with enemy pawns only
  ['kingFileOpen', 1], // No friendly pawn on the king's file
  ['kingFileBare', 1], // …and no enemy pawn either
  ['kingShield', 1],   // Per friendly pawn just in front of a king on the wing
  ['mobility', 3],     // Per reachable square, for knight, bishop, rook
];

export const OFFSET = {};
let n = 0;
for (const [name, size] of LAYOUT) { OFFSET[name] = n; n += size; }
export const N_PARAMS = n;

const TYPE_INDEX = { P: 0, N: 1, B: 2, R: 3, Q: 4, K: 5 };
export const pstIndex = (type, sq) => OFFSET.pst + TYPE_INDEX[type] * 64 + sq;
export const MOBILITY_INDEX = { N: OFFSET.mobility, B: OFFSET.mobility + 1, R: OFFSET.mobility + 2 };

// Parameters the tuner leaves alone: the king's material value, which is the
// same for both sides and always cancels, and the pawn squares on the first
// and last ranks, which a pawn can never stand on.
export const FROZEN = new Set([OFFSET.pieceValue + 5]);
for (let sq = 0; sq < 8; sq++) { FROZEN.add(pstIndex('P', sq)); FROZEN.add(pstIndex('P', 56 + sq)); }
FROZEN.add(OFFSET.passed); FROZEN.add(OFFSET.passed + 7);

// One phase's weights object → flat array, and back.
export function flatten(w) {
  const v = new Array(N_PARAMS).fill(0);
  [...PIECE_TYPES].forEach((t, i) => {
    v[OFFSET.pieceValue + i] = w.pieceValue[t];
    for (let sq = 0; sq < 64; sq++) v[pstIndex(t, sq)] = w.pst[t][sq];
  });
  v[OFFSET.doubled] = w.doubled;
  v[OFFSET.isolated] = w.isolated;
  w.passed.forEach((x, r) => { v[OFFSET.passed + r] = x; });
  v[OFFSET.bishopPair] = w.bishopPair;
  v[OFFSET.rookOpen] = w.rookOpen;
  v[OFFSET.rookSemiOpen] = w.rookSemiOpen;
  v[OFFSET.kingFileOpen] = w.kingFileOpen;
  v[OFFSET.kingFileBare] = w.kingFileBare;
  v[OFFSET.kingShield] = w.kingShield;
  for (const t of 'NBR') v[MOBILITY_INDEX[t]] = w.mobility[t];
  return v;
}

export function unflatten(v) {
  const w = { pieceValue: {}, pst: {}, mobility: {} };
  [...PIECE_TYPES].forEach((t, i) => {
    w.pieceValue[t] = v[OFFSET.pieceValue + i];
    w.pst[t] = Array.from({ length: 64 }, (_, sq) => v[pstIndex(t, sq)]);
  });
  w.doubled = v[OFFSET.doubled];
  w.isolated = v[OFFSET.isolated];
  w.passed = Array.from({ length: 8 }, (_, r) => v[OFFSET.passed + r]);
  w.bishopPair = v[OFFSET.bishopPair];
  w.rookOpen = v[OFFSET.rookOpen];
  w.rookSemiOpen = v[OFFSET.rookSemiOpen];
  w.kingFileOpen = v[OFFSET.kingFileOpen];
  w.kingFileBare = v[OFFSET.kingFileBare];
  w.kingShield = v[OFFSET.kingShield];
  for (const t of 'NBR') w.mobility[t] = v[MOBILITY_INDEX[t]];
  return w;
}

// A readable name for parameter i, for the tuner's reports.
export function paramName(i) {
  for (let k = LAYOUT.length - 1; k >= 0; k--) {
    const [name, size] = LAYOUT[k];
    const at = OFFSET[name];
    if (i < at) continue;
    if (size === 1) return name;
    if (name === 'pst') {
      const t = PIECE_TYPES[Math.floor((i - at) / 64)], sq = (i - at) % 64;
      return `pst.${t}.${'abcdefgh'[sq % 8]}${8 - Math.floor(sq / 8)}`;
    }
    if (name === 'pieceValue') return `pieceValue.${PIECE_TYPES[i - at]}`;
    if (name === 'mobility') return `mobility.${'NBR'[i - at]}`;
    return `${name}[${i - at}]`;
  }
  return `#${i}`;
}
