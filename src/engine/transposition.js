// ── Transposition Table with Zobrist Hashing ─────────────────────────────
// A fixed-size table: every array is allocated once, up front, and never grows,
// however long the session runs. When two positions want the same slot, the
// replacement policy below decides which one stays.
//
// Keys are 64-bit Zobrist hashes held as two 32-bit halves. XOR on 32-bit
// integers is exact, so this is the same 64-bit key a BigInt would give, without
// allocating a BigInt at every node.

const PIECE_INDEX = { P: 0, N: 1, B: 2, R: 3, Q: 4, K: 5, p: 6, n: 7, b: 8, r: 9, q: 10, k: 11 };

// Fixed seed, so a run is reproducible and every table shares the same keys.
let seed = 42;
function rand32() {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return seed;
}
function keys(count) {
  const hi = new Int32Array(count), lo = new Int32Array(count);
  for (let i = 0; i < count; i++) { hi[i] = rand32(); lo[i] = rand32(); }
  return { hi, lo };
}

const PIECE_KEYS = keys(12 * 64);
const SIDE_KEY = keys(1);
const CASTLING_KEYS = keys(16);
const EP_KEYS = keys(8);

// Bound types. 0 marks an empty slot.
export const TT_EXACT = 1;
export const TT_ALPHA = 2; // Upper bound: every move failed low
export const TT_BETA  = 3; // Lower bound: a move failed high

// Mate scores are ±(MATE − plies from the root). Stored relative to the node
// instead, so a mate found on one path is read back correctly on another.
const MATE = 20000;
const MATE_BOUND = 15000;
const toStored = (score, ply) => (score > MATE_BOUND ? score + ply : score < -MATE_BOUND ? score - ply : score);
const fromStored = (score, ply) => (score > MATE_BOUND ? score - ply : score < -MATE_BOUND ? score + ply : score);

// A best move packed into one integer: from, to and promotion piece. Never 0,
// since from and to always differ.
const PROMO_CODE = { '.': 0, q: 1, r: 2, b: 3, n: 4, Q: 1, R: 2, B: 3, N: 4 };
export const encodeMove = (move) => move.startSq | (move.targetSq << 6) | (PROMO_CODE[move.promotionPiece] << 12);

// 2^19 slots at 19 bytes each is about 10 MB.
export const DEFAULT_TT_BITS = 19;

export class TranspositionTable {
  constructor(bits = DEFAULT_TT_BITS) {
    this.size = 1 << bits;
    this.mask = this.size - 1;
    this.keyHi = new Int32Array(this.size);
    this.keyLo = new Int32Array(this.size);
    this.scores = new Int32Array(this.size);
    this.moves = new Int32Array(this.size);
    this.depths = new Int8Array(this.size);
    this.bounds = new Uint8Array(this.size);
    this.ages = new Uint8Array(this.size);
    this.age = 0;
    this.used = 0;
  }

  computeHash(board) {
    let hi = 0, lo = 0;
    const squares = board.squares;
    for (let sq = 0; sq < 64; sq++) {
      const p = squares[sq];
      if (p === '.') continue;
      const k = PIECE_INDEX[p] * 64 + sq;
      hi ^= PIECE_KEYS.hi[k];
      lo ^= PIECE_KEYS.lo[k];
    }
    if (board.sideToMove === 'b') { hi ^= SIDE_KEY.hi[0]; lo ^= SIDE_KEY.lo[0]; }
    const c = board.castlingRights;
    const ci = (c.K ? 1 : 0) | (c.Q ? 2 : 0) | (c.k ? 4 : 0) | (c.q ? 8 : 0);
    hi ^= CASTLING_KEYS.hi[ci];
    lo ^= CASTLING_KEYS.lo[ci];
    if (board.enPassant !== null) {
      hi ^= EP_KEYS.hi[board.enPassant % 8];
      lo ^= EP_KEYS.lo[board.enPassant % 8];
    }
    return { hi, lo };
  }

  // Replacement: a slot already holding this position is always refreshed, and
  // an entry left over from an earlier search always gives way. Between two
  // positions from the same search, the deeper result stays — it cost more.
  store(key, depth, score, bound, bestMove, ply = 0) {
    const i = key.lo & this.mask;
    const occupied = this.bounds[i] !== 0;
    const same = occupied && this.keyHi[i] === key.hi && this.keyLo[i] === key.lo;
    if (occupied && !same && this.ages[i] === this.age && this.depths[i] > depth) return;
    if (!occupied) this.used++;
    this.keyHi[i] = key.hi;
    this.keyLo[i] = key.lo;
    this.scores[i] = toStored(score, ply);
    this.moves[i] = bestMove ? encodeMove(bestMove) : same ? this.moves[i] : 0;
    this.depths[i] = depth;
    this.bounds[i] = bound;
    this.ages[i] = this.age;
  }

  // Returns [score, bestMove]: a score only when the entry is deep enough and its
  // bound settles this window, and the packed best move whenever the position is
  // known, for move ordering.
  lookup(key, depth, alpha, beta, ply = 0) {
    const i = key.lo & this.mask;
    if (this.bounds[i] === 0 || this.keyHi[i] !== key.hi || this.keyLo[i] !== key.lo) return [null, 0];
    const move = this.moves[i];
    if (this.depths[i] >= depth) {
      const score = fromStored(this.scores[i], ply);
      const bound = this.bounds[i];
      if (bound === TT_EXACT) return [score, move];
      if (bound === TT_ALPHA && score <= alpha) return [alpha, move];
      if (bound === TT_BETA  && score >= beta)  return [beta,  move];
    }
    return [null, move];
  }

  // Marks the start of a new search, so what the last one stored can be replaced.
  newSearch() { this.age = (this.age + 1) & 0xFF; }

  clear() {
    this.bounds.fill(0);
    this.used = 0;
    this.age = 0;
  }

  // Share of slots in use, in permille, as UCI engines report it.
  hashfull() { return Math.round((this.used / this.size) * 1000); }
}
