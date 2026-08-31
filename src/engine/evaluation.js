// ── Static evaluation function ────────────────────────────────────────────
// Returns score in centipawns from White's perspective.

const PIECE_VALUES = { P:100, N:320, B:330, R:500, Q:900, K:20000, p:-100, n:-320, b:-330, r:-500, q:-900, k:-20000 };

const PAWN_PST   = [ 0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0 ];
const KNIGHT_PST = [ -50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50 ];
const BISHOP_PST = [ -20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20 ];
const ROOK_PST   = [ 0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0 ];
const QUEEN_PST  = [ -20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20 ];
const KING_PST   = [ -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20 ];

const PST_MAP = { p: PAWN_PST, n: KNIGHT_PST, b: BISHOP_PST, r: ROOK_PST, q: QUEEN_PST, k: KING_PST };

export class Evaluation {
  evaluate(board) {
    let score = 0;
    const wPawns = [], bPawns = [];
    let wKingSq = -1, bKingSq = -1;

    for (let sq = 0; sq < 64; sq++) {
      const piece = board.squares[sq];
      if (piece === '.') continue;
      score += PIECE_VALUES[piece];
      const isWhite = piece === piece.toUpperCase();
      const pstSq = isWhite ? sq : (63 - sq);
      const pt = piece.toLowerCase();
      const pstScore = PST_MAP[pt] ? PST_MAP[pt][pstSq] : 0;
      if (isWhite) {
        score += pstScore;
        if (piece === 'P') wPawns.push(sq);
        if (piece === 'K') wKingSq = sq;
      } else {
        score -= pstScore;
        if (piece === 'p') bPawns.push(sq);
        if (piece === 'k') bKingSq = sq;
      }
    }

    score += this._pawnStructure(wPawns);
    score -= this._pawnStructure(bPawns);
    score += this._kingSafety(wKingSq, wPawns, bPawns, 'w');
    score -= this._kingSafety(bKingSq, bPawns, wPawns, 'b');
    return score; // Positive = White winning
  }

  _pawnStructure(pawns) {
    let penalty = 0;
    const files = pawns.map(sq => sq % 8);
    for (let f = 0; f < 8; f++) {
      const cnt = files.filter(x => x === f).length;
      if (cnt > 1) penalty += 15 * cnt;
    }
    for (const sq of pawns) {
      const f = sq % 8;
      if (!files.includes(f - 1) && !files.includes(f + 1)) penalty += 20;
    }
    return -penalty;
  }

  _kingSafety(kingSq, ownPawns, enemyPawns, color) {
    if (kingSq === -1) return 0;
    let s = 0;
    const kf = kingSq % 8;
    const ownFiles = ownPawns.map(sq => sq % 8);
    const enemyFiles = enemyPawns.map(sq => sq % 8);
    if (!ownFiles.includes(kf)) { s -= 30; if (!enemyFiles.includes(kf)) s -= 20; }
    if (kf <= 2 || kf >= 5) {
      const dir = color === 'w' ? -8 : 8;
      for (const shieldSq of [kingSq + dir - 1, kingSq + dir, kingSq + dir + 1]) {
        if (shieldSq >= 0 && shieldSq < 64 && ownPawns.includes(shieldSq)) s += 10;
      }
    }
    return s;
  }
}
