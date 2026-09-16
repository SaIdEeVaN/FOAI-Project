// ── Static evaluation function ────────────────────────────────────────────
// Returns score in centipawns from White's perspective.

const PIECE_VALUES = { P:100, N:320, B:330, R:500, Q:900, K:20000, p:-100, n:-320, b:-330, r:-500, q:-900, k:-20000 };

const PAWN_PST   = [ 0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0 ];
const KNIGHT_PST = [ -50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50 ];
const BISHOP_PST = [ -20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20 ];
const ROOK_PST   = [ 0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0 ];
const QUEEN_PST  = [ -20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20 ];
const KING_PST   = [ -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20 ];

// Keyed by piece letter of either colour, so the hot loop never changes case.
const PST_BY_PIECE = {
  P: PAWN_PST, N: KNIGHT_PST, B: BISHOP_PST, R: ROOK_PST, Q: QUEEN_PST, K: KING_PST,
  p: PAWN_PST, n: KNIGHT_PST, b: BISHOP_PST, r: ROOK_PST, q: QUEEN_PST, k: KING_PST,
};

// Knight mobility ignores occupancy, so it is a fixed count per square.
const KNIGHT_MOBILITY = Array.from({ length: 64 }, (_, sq) =>
  [-17, -15, -10, -6, 6, 10, 15, 17].filter(off => {
    const target = sq + off;
    return target >= 0 && target < 64 && Math.abs((sq % 8) - (target % 8)) <= 2;
  }).length);

const BISHOP_DIRECTIONS = [-9, -7, 7, 9];

export class Evaluation {
  constructor() {
    this._scratch = {};
    this._wFiles = new Int8Array(8); // Pawns per file
    this._bFiles = new Int8Array(8);
  }

  evaluate(board) {
    return this._terms(board, this._scratch).total; // Positive = White winning
  }

  // The individual terms that make up evaluate(), all from White's perspective.
  breakdown(board) {
    return this._terms(board, {});
  }

  _terms(board, out) {
    const squares = board.squares;
    const wFiles = this._wFiles.fill(0);
    const bFiles = this._bFiles.fill(0);
    let material = 0, pieceSquare = 0, mobility = 0;
    let wKingSq = -1, bKingSq = -1;

    for (let sq = 0; sq < 64; sq++) {
      const piece = squares[sq];
      if (piece === '.') continue;
      material += PIECE_VALUES[piece];
      if (piece < 'a') { // Upper case = White
        pieceSquare += PST_BY_PIECE[piece][sq];
        if (piece === 'P') wFiles[sq % 8]++;
        else if (piece === 'K') wKingSq = sq;
        else if (piece === 'N') mobility += KNIGHT_MOBILITY[sq] * 2;
        else if (piece === 'B') mobility += this._bishopMobility(squares, sq) * 2;
      } else {
        pieceSquare -= PST_BY_PIECE[piece][63 - sq];
        if (piece === 'p') bFiles[sq % 8]++;
        else if (piece === 'k') bKingSq = sq;
        else if (piece === 'n') mobility -= KNIGHT_MOBILITY[sq] * 2;
        else if (piece === 'b') mobility -= this._bishopMobility(squares, sq) * 2;
      }
    }

    const pawnStructure = this._pawnStructure(wFiles) - this._pawnStructure(bFiles);
    const kingSafety = this._kingSafety(squares, wKingSq, wFiles, bFiles, 'w')
                     - this._kingSafety(squares, bKingSq, bFiles, wFiles, 'b');

    out.material = material;
    out.pieceSquare = pieceSquare;
    out.pawnStructure = pawnStructure;
    out.kingSafety = kingSafety;
    out.mobility = mobility;
    out.total = material + pieceSquare + pawnStructure + kingSafety + mobility;
    return out;
  }

  // Doubled pawns cost 15 each, isolated pawns 20 each.
  _pawnStructure(files) {
    let penalty = 0;
    for (let f = 0; f < 8; f++) {
      const cnt = files[f];
      if (!cnt) continue;
      if (cnt > 1) penalty += 15 * cnt;
      if ((f === 0 || !files[f - 1]) && (f === 7 || !files[f + 1])) penalty += 20 * cnt;
    }
    return -penalty;
  }

  _kingSafety(squares, kingSq, ownFiles, enemyFiles, color) {
    if (kingSq === -1) return 0;
    let s = 0;
    const kf = kingSq % 8;
    if (!ownFiles[kf]) { s -= 30; if (!enemyFiles[kf]) s -= 20; }
    if (kf <= 2 || kf >= 5) {
      const ahead = kingSq + (color === 'w' ? -8 : 8);
      const pawn = color === 'w' ? 'P' : 'p';
      for (let d = -1; d <= 1; d++) {
        const shieldSq = ahead + d;
        if (shieldSq >= 0 && shieldSq < 64 && Math.abs((shieldSq % 8) - kf) <= 1 && squares[shieldSq] === pawn) s += 10;
      }
    }
    return s;
  }

  _bishopMobility(squares, sq) {
    let count = 0;
    for (const dir of BISHOP_DIRECTIONS) {
      for (let step = 1; step < 8; step++) {
        const target = sq + dir * step;
        if (target < 0 || target >= 64) break;
        const prevFile = (target - dir) % 8;
        const currFile = target % 8;
        if (Math.abs(currFile - prevFile) > 1) break;
        count++;
        if (squares[target] !== '.') break;
      }
    }
    return count;
  }
}
