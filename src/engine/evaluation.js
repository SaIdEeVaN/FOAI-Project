// ── Static evaluation function ────────────────────────────────────────────
// Returns score in centipawns from White's perspective.
//
// Tapered: every term has a middlegame and an endgame weight (weights.js), and
// the two are blended by the game phase — how much non-pawn material is left —
// so a king that should hide behind its pawns with the queens on walks to the
// centre once they are off, and a passed pawn grows in value as pieces come off.
//
// The weights were fitted to game results by bench/tune.js (Texel tuning). The
// evaluation is linear in them, which is what makes that a logistic regression;
// features() exposes the position in the tuner's terms.
import { WEIGHTS } from './weights.js';
import { PHASE_MAX, OFFSET, N_PARAMS, pstIndex, MOBILITY_INDEX } from './evalLayout.js';

const PHASE = { P: 0, N: 1, B: 1, R: 2, Q: 4, K: 0, p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 };

// Per piece letter, signed (+ White, − Black), with Black's squares mirrored
// top to bottom, so the hot loop is a single lookup per term.
function signedTables(w) {
  const mat = {}, pst = {};
  for (const t of 'PNBRQK') {
    const lower = t.toLowerCase();
    mat[t] = w.pieceValue[t];
    mat[lower] = -w.pieceValue[t];
    const white = new Int32Array(64), black = new Int32Array(64);
    for (let sq = 0; sq < 64; sq++) {
      white[sq] = w.pst[t][sq];
      black[sq] = -w.pst[t][sq ^ 56];
    }
    pst[t] = white;
    pst[lower] = black;
  }
  return { mat, pst };
}

const MG = signedTables(WEIGHTS.mg);
const EG = signedTables(WEIGHTS.eg);
const W_MG = WEIGHTS.mg, W_EG = WEIGHTS.eg;

// Knight targets and slider rays per square, worked out once.
const KNIGHT_TARGETS = Array.from({ length: 64 }, (_, sq) =>
  [-17, -15, -10, -6, 6, 10, 15, 17].map(off => sq + off)
    .filter(t => t >= 0 && t < 64 && Math.abs((sq % 8) - (t % 8)) <= 2));

function rays(sq, dirs) {
  return dirs.map(([df, dr]) => {
    const out = [];
    let f = (sq % 8) + df, r = Math.floor(sq / 8) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) { out.push(r * 8 + f); f += df; r += dr; }
    return out;
  });
}
const DIAGONALS = Array.from({ length: 64 }, (_, sq) => rays(sq, [[-1, -1], [1, -1], [-1, 1], [1, 1]]));
const LINES = Array.from({ length: 64 }, (_, sq) => rays(sq, [[0, -1], [-1, 0], [1, 0], [0, 1]]));

// Squares a piece could move to: empty, or holding an enemy piece.
function knightMobility(squares, sq, white) {
  let count = 0;
  for (const t of KNIGHT_TARGETS[sq]) {
    const q = squares[t];
    if (q === '.' || (q < 'a') !== white) count++;
  }
  return count;
}

function sliderMobility(squares, rayList, white) {
  let count = 0;
  for (const ray of rayList) {
    for (let i = 0; i < ray.length; i++) {
      const q = squares[ray[i]];
      if (q === '.') { count++; continue; }
      if ((q < 'a') !== white) count++;
      break;
    }
  }
  return count;
}

// Rounds toward zero, so that mirroring the position exactly negates every
// term; `| 0` rather than Math.trunc, which would turn −0.5 into −0.
const taper = (mg, eg, phase) => ((mg * phase + eg * (PHASE_MAX - phase)) / PHASE_MAX) | 0;

export const EVAL_TERMS = ['material', 'pieceSquare', 'pawnStructure', 'kingSafety', 'mobility'];

export class Evaluation {
  constructor() {
    this._scratch = {};
    this._counts = {
      passed: new Int8Array(8), // White's passed pawns minus Black's, by relative rank
    };
    this._wFiles = new Int8Array(8);   // Pawns per file
    this._bFiles = new Int8Array(8);
    this._wBack = new Int8Array(8);    // Row of White's rearmost pawn per file (-1: none)
    this._bBack = new Int8Array(8);    // Row of Black's rearmost pawn per file (8: none)
    this._wPawns = new Int8Array(8 * 8);
    this._bPawns = new Int8Array(8 * 8);
    this._wRooks = new Int8Array(10);
    this._bRooks = new Int8Array(10);
  }

  evaluate(board) {
    return this._terms(board, this._scratch).total; // Positive = White winning
  }

  // The individual terms that make up evaluate(), all from White's perspective,
  // plus the game phase (24 = all pieces on, 0 = kings and pawns).
  breakdown(board) {
    return this._terms(board, {});
  }

  _terms(board, out) {
    const c = this._scan(board, this._counts);
    const phase = c.phase;

    let pawnMg = c.doubled * W_MG.doubled + c.isolated * W_MG.isolated;
    let pawnEg = c.doubled * W_EG.doubled + c.isolated * W_EG.isolated;
    for (let r = 1; r < 7; r++) {
      const n = c.passed[r];
      if (n) { pawnMg += n * W_MG.passed[r]; pawnEg += n * W_EG.passed[r]; }
    }
    const kingMg = c.kingFileOpen * W_MG.kingFileOpen + c.kingFileBare * W_MG.kingFileBare + c.kingShield * W_MG.kingShield;
    const kingEg = c.kingFileOpen * W_EG.kingFileOpen + c.kingFileBare * W_EG.kingFileBare + c.kingShield * W_EG.kingShield;
    const mobMg = c.mobN * W_MG.mobility.N + c.mobB * W_MG.mobility.B + c.mobR * W_MG.mobility.R
                + c.rookOpen * W_MG.rookOpen + c.rookSemiOpen * W_MG.rookSemiOpen;
    const mobEg = c.mobN * W_EG.mobility.N + c.mobB * W_EG.mobility.B + c.mobR * W_EG.mobility.R
                + c.rookOpen * W_EG.rookOpen + c.rookSemiOpen * W_EG.rookSemiOpen;

    out.material = taper(c.matMg + c.bishopPair * W_MG.bishopPair, c.matEg + c.bishopPair * W_EG.bishopPair, phase);
    out.pieceSquare = taper(c.pstMg, c.pstEg, phase);
    out.pawnStructure = taper(pawnMg, pawnEg, phase);
    out.kingSafety = taper(kingMg, kingEg, phase);
    out.mobility = taper(mobMg, mobEg, phase);
    out.total = out.material + out.pieceSquare + out.pawnStructure + out.kingSafety + out.mobility;
    out.phase = phase;
    return out;
  }

  // Counts every pattern the evaluation weighs, as White's count minus Black's,
  // along with the material and piece-square sums, which are cheaper to add up
  // here than to count.
  _scan(board, c) {
    const squares = board.squares;
    const wFiles = this._wFiles.fill(0), bFiles = this._bFiles.fill(0);
    const wBack = this._wBack.fill(-1), bBack = this._bBack.fill(8);
    const wPawns = this._wPawns, bPawns = this._bPawns, wRooks = this._wRooks, bRooks = this._bRooks;
    let nwp = 0, nbp = 0, nwr = 0, nbr = 0;
    let matMg = 0, matEg = 0, pstMg = 0, pstEg = 0, phase = 0;
    let mobN = 0, mobB = 0, mobR = 0, wBishops = 0, bBishops = 0;
    let wKing = -1, bKing = -1;

    for (let sq = 0; sq < 64; sq++) {
      const p = squares[sq];
      if (p === '.') continue;
      matMg += MG.mat[p]; matEg += EG.mat[p];
      pstMg += MG.pst[p][sq]; pstEg += EG.pst[p][sq];
      phase += PHASE[p];
      switch (p) {
        case 'P': { const f = sq & 7, r = sq >> 3; wFiles[f]++; if (r > wBack[f]) wBack[f] = r; wPawns[nwp++] = sq; break; }
        case 'p': { const f = sq & 7, r = sq >> 3; bFiles[f]++; if (r < bBack[f]) bBack[f] = r; bPawns[nbp++] = sq; break; }
        case 'N': mobN += knightMobility(squares, sq, true); break;
        case 'n': mobN -= knightMobility(squares, sq, false); break;
        case 'B': wBishops++; mobB += sliderMobility(squares, DIAGONALS[sq], true); break;
        case 'b': bBishops++; mobB -= sliderMobility(squares, DIAGONALS[sq], false); break;
        case 'R': mobR += sliderMobility(squares, LINES[sq], true); if (nwr < 10) wRooks[nwr++] = sq; break;
        case 'r': mobR -= sliderMobility(squares, LINES[sq], false); if (nbr < 10) bRooks[nbr++] = sq; break;
        case 'K': wKing = sq; break;
        case 'k': bKing = sq; break;
      }
    }

    // Pawn structure. A White pawn is passed when no Black pawn stands ahead of
    // it on its own or a neighbouring file, i.e. none of those files has a
    // Black pawn on a lower row; the same for Black, mirrored.
    let doubled = 0, isolated = 0;
    for (let f = 0; f < 8; f++) {
      const w = wFiles[f], b = bFiles[f];
      if (w > 1) doubled += w;
      if (b > 1) doubled -= b;
      const wNeighbours = (f > 0 && wFiles[f - 1]) || (f < 7 && wFiles[f + 1]);
      const bNeighbours = (f > 0 && bFiles[f - 1]) || (f < 7 && bFiles[f + 1]);
      if (w && !wNeighbours) isolated += w;
      if (b && !bNeighbours) isolated -= b;
    }
    const passed = c.passed.fill(0);
    for (let i = 0; i < nwp; i++) {
      const sq = wPawns[i], f = sq & 7, r = sq >> 3;
      if (bBack[f] < r || (f > 0 && bBack[f - 1] < r) || (f < 7 && bBack[f + 1] < r)) continue;
      passed[7 - r]++;
    }
    for (let i = 0; i < nbp; i++) {
      const sq = bPawns[i], f = sq & 7, r = sq >> 3;
      if (wBack[f] > r || (f > 0 && wBack[f - 1] > r) || (f < 7 && wBack[f + 1] > r)) continue;
      passed[r]--;
    }

    // Rooks on files without pawns of their own colour.
    let rookOpen = 0, rookSemiOpen = 0;
    for (let i = 0; i < nwr; i++) {
      const f = wRooks[i] & 7;
      if (!wFiles[f]) { if (bFiles[f]) rookSemiOpen++; else rookOpen++; }
    }
    for (let i = 0; i < nbr; i++) {
      const f = bRooks[i] & 7;
      if (!bFiles[f]) { if (wFiles[f]) rookSemiOpen--; else rookOpen--; }
    }

    // King safety: a file without a friendly pawn in front of the king, and the
    // pawns sheltering a king that has gone to a wing.
    let kingFileOpen = 0, kingFileBare = 0, kingShield = 0;
    if (wKing >= 0) {
      const kf = wKing & 7;
      if (!wFiles[kf]) { kingFileOpen++; if (!bFiles[kf]) kingFileBare++; }
      kingShield += this._shield(squares, wKing, -8, 'P');
    }
    if (bKing >= 0) {
      const kf = bKing & 7;
      if (!bFiles[kf]) { kingFileOpen--; if (!wFiles[kf]) kingFileBare--; }
      kingShield -= this._shield(squares, bKing, 8, 'p');
    }

    c.matMg = matMg; c.matEg = matEg; c.pstMg = pstMg; c.pstEg = pstEg;
    c.phase = phase > PHASE_MAX ? PHASE_MAX : phase;
    c.mobN = mobN; c.mobB = mobB; c.mobR = mobR;
    c.bishopPair = (wBishops >= 2 ? 1 : 0) - (bBishops >= 2 ? 1 : 0);
    c.doubled = doubled; c.isolated = isolated;
    c.rookOpen = rookOpen; c.rookSemiOpen = rookSemiOpen;
    c.kingFileOpen = kingFileOpen; c.kingFileBare = kingFileBare; c.kingShield = kingShield;
    return c;
  }

  _shield(squares, kingSq, forward, pawn) {
    const kf = kingSq & 7;
    if (kf > 2 && kf < 5) return 0;
    let n = 0;
    const ahead = kingSq + forward;
    for (let d = -1; d <= 1; d++) {
      const sq = ahead + d;
      if (sq >= 0 && sq < 64 && Math.abs((sq & 7) - kf) <= 1 && squares[sq] === pawn) n++;
    }
    return n;
  }

  // The position as the tuner sees it: the game phase, and a sparse list of
  // [parameter index, White's count minus Black's] in evalLayout.js order, so
  // that Σ value · (mg[index]·phase + eg[index]·(24 − phase)) / 24 is
  // evaluate() before rounding.
  features(board) {
    const c = this._scan(board, { passed: new Int8Array(8) });
    const counts = new Map();
    const add = (i, v) => { if (v) counts.set(i, (counts.get(i) || 0) + v); };
    const squares = board.squares;
    for (let sq = 0; sq < 64; sq++) {
      const p = squares[sq];
      if (p === '.') continue;
      const white = p < 'a';
      const t = p.toUpperCase();
      add(OFFSET.pieceValue + 'PNBRQK'.indexOf(t), white ? 1 : -1);
      add(pstIndex(t, white ? sq : sq ^ 56), white ? 1 : -1);
    }
    add(OFFSET.doubled, c.doubled);
    add(OFFSET.isolated, c.isolated);
    for (let r = 0; r < 8; r++) add(OFFSET.passed + r, c.passed[r]);
    add(OFFSET.bishopPair, c.bishopPair);
    add(OFFSET.rookOpen, c.rookOpen);
    add(OFFSET.rookSemiOpen, c.rookSemiOpen);
    add(OFFSET.kingFileOpen, c.kingFileOpen);
    add(OFFSET.kingFileBare, c.kingFileBare);
    add(OFFSET.kingShield, c.kingShield);
    add(MOBILITY_INDEX.N, c.mobN);
    add(MOBILITY_INDEX.B, c.mobB);
    add(MOBILITY_INDEX.R, c.mobR);
    const index = [], value = [];
    for (const [i, v] of counts) if (v) { index.push(i); value.push(v); }
    return { phase: c.phase, index, value };
  }
}

export { N_PARAMS };
