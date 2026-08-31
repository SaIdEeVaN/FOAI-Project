// ── Transposition Table with Zobrist Hashing ─────────────────────────────
// Uses BigInt for correct 64-bit XOR operations.

const PIECES = ['P','N','B','R','Q','K','p','n','b','r','q','k'];

function rand64() {
  const hi = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
  const lo = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
  return (hi << 32n) | lo;
}

export const TT_EXACT = 0;
export const TT_ALPHA = 1;
export const TT_BETA  = 2;

export class TranspositionTable {
  constructor() {
    // Seed with a fixed value for reproducibility
    const origRandom = Math.random;
    let seed = 42;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF; return (seed >>> 0) / 0x100000000; };

    this.pieceKeys = {};
    for (const p of PIECES) {
      this.pieceKeys[p] = Array.from({ length: 64 }, rand64);
    }
    this.sideKey = rand64();
    this.castlingKeys = Array.from({ length: 16 }, rand64);
    this.epKeys = Array.from({ length: 8 }, rand64);

    Math.random = origRandom;
    this.table = new Map();
  }

  computeHash(board) {
    let h = 0n;
    for (let sq = 0; sq < 64; sq++) {
      const p = board.squares[sq];
      if (p !== '.') h ^= this.pieceKeys[p][sq];
    }
    if (board.sideToMove === 'b') h ^= this.sideKey;
    let ci = 0;
    if (board.castlingRights.K) ci |= 1;
    if (board.castlingRights.Q) ci |= 2;
    if (board.castlingRights.k) ci |= 4;
    if (board.castlingRights.q) ci |= 8;
    h ^= this.castlingKeys[ci];
    if (board.enPassant !== null) h ^= this.epKeys[board.enPassant % 8];
    return h.toString();
  }

  store(key, depth, score, flag, bestMove) {
    this.table.set(key, { depth, score, flag, bestMove });
  }

  lookup(key, depth, alpha, beta) {
    const entry = this.table.get(key);
    if (!entry) return [null, null];
    if (entry.depth >= depth) {
      if (entry.flag === TT_EXACT) return [entry.score, entry.bestMove];
      if (entry.flag === TT_ALPHA && entry.score <= alpha) return [alpha, entry.bestMove];
      if (entry.flag === TT_BETA  && entry.score >= beta)  return [beta,  entry.bestMove];
    }
    return [null, entry.bestMove];
  }
}
