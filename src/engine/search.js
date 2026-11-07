import { MoveGenerator } from './moveGen.js';
import { Evaluation } from './evaluation.js';
import { TranspositionTable, TT_EXACT, TT_ALPHA, TT_BETA, encodeMove } from './transposition.js';

const PIECE_ORDER = { P:1, N:3, B:3, R:5, Q:9, K:100, p:1, n:3, b:3, r:5, q:9, k:100, '.':0 };

export const MATE = 20000;
const MATE_BOUND = 15000;
export const NULL_MOVE_R = 2;
// Null move only where at least this many plies remain, so the reduced search
// is always one full ply deep. Straight into quiescence it sees captures only,
// is blind to a quiet mating threat, and on Win at Chess #1 cut the one line
// that mates. In self-play the stricter limit cost nothing measurable (REPORT.md).
export const NULL_MIN_DEPTH = NULL_MOVE_R + 2;

// Move ordering bands. Every capture and promotion sorts above both killers,
// and the killers above every quiet move the history table has seen; the bands
// are far enough apart that no score from one can reach the next.
const ORDER_HASH = 1_000_000;
const ORDER_NOISY = 100_000;
const ORDER_KILLER_1 = 90_000;
const ORDER_KILLER_2 = 80_000;
// History scores are halved whenever one passes this, so they stay below the
// killers and the table keeps favouring what worked recently.
const HISTORY_MAX = 60_000;
const MAX_PLY = 128;

export class SearchEngine {
  // positionHistory is every position the real game has already stood in, oldest
  // first, ending with the position at the root. Without it the search can only
  // see repetitions inside its own tree, and would miss that a line repeats a
  // position the game has already been in twice.
  //
  // Options:
  //   tt        a TranspositionTable to reuse across searches. Its size is fixed,
  //             so keeping one for a whole game costs no extra memory.
  //   contempt  centipawns the engine gives up to avoid a draw. Positive: a draw
  //             scores below zero for the engine, so it plays on in a level
  //             position. Negative: it welcomes a draw. 0: a draw is worth 0.
  //   nullMove  null-move pruning on or off (on by default).
  //   nullMinDepth  the fewest plies left at which a null move is tried.
  //   killers   killer-move ordering on or off (on by default).
  //   history   history-heuristic ordering on or off (on by default).
  constructor(board, positionHistory = [], {
    tt = null, contempt = 0, nullMove = true, nullMinDepth = NULL_MIN_DEPTH, killers = true, history = true,
  } = {}) {
    this.board = board;
    this.gameHistory = positionHistory;
    this.evaluator = new Evaluation();
    this.tt = tt || new TranspositionTable();
    this.contempt = contempt;
    this.nullMove = nullMove;
    this.nullMinDepth = nullMinDepth;
    this.useKillers = killers;
    this.useHistory = history;
    // Two killer slots per ply: the last two quiet moves that caused a beta
    // cutoff at that distance from the root, packed as the table packs moves.
    this.killers = new Int32Array(MAX_PLY * 2);
    // history[side][from][to]: how often, and how deep, a quiet move has
    // refuted a position anywhere in the tree. Indexed side * 4096 + from * 64 + to.
    this.history = new Int32Array(2 * 64 * 64);
    this.nodes = 0;
    this.maxDepth = 0;
    this.startTime = 0;
    this.timeLimitMs = 2000;
    this.abort = false;
    this.onProgress = null;
    this.repKeys = [];
    this.rootSide = board.sideToMove;
  }

  getBestMove(timeLimitMs = 2000, onProgress = null, { maxDepth = 12 } = {}) {
    this.timeLimitMs = timeLimitMs;
    this.onProgress = onProgress;
    this.startTime = Date.now();
    this.nodes = 0;
    this.abort = false;
    this.repKeys = [...this.gameHistory];
    this.rootSide = this.board.sideToMove;
    this.tt.newSearch();
    // The app and the benchmarks build a new engine for every move, so both
    // tables normally start empty. If an engine is reused, killers start afresh
    // (they belong to plies of one search) and history carries over at half
    // weight: a move that refuted things last time is still a fair first guess.
    this.killers.fill(0);
    for (let i = 0; i < this.history.length; i++) this.history[i] >>= 1;

    let bestMove = null;
    let finalScore = 0;

    for (let depth = 1; depth <= maxDepth; depth++) {
      if (depth > 1 && Date.now() - this.startTime >= this.timeLimitMs) break;
      this.maxDepth = depth;
      const [score, move] = this._root(depth, -Infinity, Infinity);
      if (this.abort) break;
      if (move) { bestMove = move; finalScore = score; }
      if (onProgress) onProgress({ depth, score, nodes: this.nodes, time: Date.now() - this.startTime, move: move ? move.toUci() : null });
      if (Math.abs(score) > MATE_BOUND) break; // Forced mate
    }

    return { bestMove, depth: this.maxDepth, nodes: this.nodes, score: finalScore };
  }

  // Depth 1 always runs to the end, however short the time: it is a few
  // thousand nodes at most, and without it there would be no move to play.
  _checkTime() {
    this.nodes++;
    if ((this.nodes & 2047) === 0 && this.maxDepth > 1 && Date.now() - this.startTime >= this.timeLimitMs) {
      this.abort = true;
    }
  }

  _root(depth, alpha, beta) {
    const gen = new MoveGenerator(this.board);
    const moves = gen.generateLegalMoves();
    if (!moves.length) return [0, null];

    const hk = this.tt.computeHash(this.board);
    const [, ttMove] = this.tt.lookup(hk, depth, alpha, beta, 0);
    const ordered = this._order(moves, ttMove, 0);

    let best = null, bestScore = -Infinity;
    for (const move of ordered) {
      this.board.makeMove(move);
      this.repKeys.push(this.board.positionKey());
      const score = -this._negamax(depth - 1, 1, -beta, -alpha, true);
      this.repKeys.pop();
      this.board.unmakeMove(move);
      if (score > bestScore) { bestScore = score; best = move; }
      if (score > alpha) alpha = score;
    }
    if (!this.abort) this.tt.store(hk, depth, bestScore, TT_EXACT, best, 0);
    return [bestScore, best];
  }

  _negamax(depth, ply, alpha, beta, allowNull) {
    this._checkTime();
    if (this.abort) return 0;

    // Before the transposition probe, which would otherwise hand back a score
    // for this position and hide the fact that the line has repeated it.
    if (this._isRepetition() || this.board.halfMoveClock >= 100) return this._drawScore();

    const hk = this.tt.computeHash(this.board);
    const [ttVal, ttMove] = this.tt.lookup(hk, depth, alpha, beta, ply);
    if (ttVal !== null) return ttVal;

    if (depth <= 0) return this._quiescence(alpha, beta);

    const gen = new MoveGenerator(this.board);
    const moves = gen.generateLegalMoves();
    const stm = this.board.sideToMove;
    const inCheck = gen.isInCheck(stm);
    if (!moves.length) return inCheck ? -MATE + ply : this._drawScore();

    // Null move: let the opponent move twice. If the reduced search still fails
    // high, a real move would too, so the node is cut without searching one.
    // Skipped in check (passing would be illegal), straight after another null
    // move, near mate scores, and with only king and pawns, where zugzwang is
    // common and passing is often the one thing the side to move cannot afford.
    if (this.nullMove && allowNull && !inCheck && depth >= this.nullMinDepth &&
        Math.abs(beta) < MATE_BOUND && this._hasPieces(stm)) {
      const score = -this._nullSearch(depth - 1 - NULL_MOVE_R, ply + 1, beta);
      if (this.abort) return 0;
      if (score >= beta) return beta;
    }

    const ordered = this._order(moves, ttMove, ply);
    let bestScore = -Infinity, origAlpha = alpha, bestMove = null;

    for (const move of ordered) {
      if (this.abort) return 0;
      this.board.makeMove(move);
      this.repKeys.push(this.board.positionKey());
      const score = -this._negamax(depth - 1, ply + 1, -beta, -alpha, true);
      this.repKeys.pop();
      this.board.unmakeMove(move);
      if (score > bestScore) { bestScore = score; bestMove = move; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        this._rememberCutoff(move, ply, depth);
        break;
      }
    }
    if (this.abort) return 0;

    const flag = bestScore <= origAlpha ? TT_ALPHA : bestScore >= beta ? TT_BETA : TT_EXACT;
    this.tt.store(hk, depth, bestScore, flag, bestMove, ply);
    return bestScore;
  }

  // Passes the move and searches the opponent's reply with a null window at beta.
  // The pass is irreversible as far as repetition goes: the half-move clock is
  // zeroed for its duration, so no line below it can match a position above it.
  _nullSearch(depth, ply, beta) {
    const board = this.board;
    const { enPassant, halfMoveClock, sideToMove } = board;
    board.enPassant = null;
    board.halfMoveClock = 0;
    board.sideToMove = sideToMove === 'w' ? 'b' : 'w';
    this.repKeys.push(board.positionKey());
    const score = this._negamax(depth, ply, -beta, -beta + 1, false);
    this.repKeys.pop();
    board.sideToMove = sideToMove;
    board.halfMoveClock = halfMoveClock;
    board.enPassant = enPassant;
    return score;
  }

  // A draw is worth -contempt to the engine, and so +contempt to its opponent.
  _drawScore() {
    return this.board.sideToMove === this.rootSide ? -this.contempt : this.contempt;
  }

  // A position this line or the game has already stood in scores as a draw. One
  // earlier occurrence is enough: if a position can be reached twice it can
  // usually be reached a third time, so this is what lets the engine head for a
  // repetition when it is losing and steer clear of one when it is winning.
  //
  // Only positions since the last irreversible move can match, which halfMoveClock
  // bounds, and only those with the same side to move, which is every second ply.
  // Quiescence needs no such check: it searches captures only, and a capture
  // resets the clock.
  _isRepetition() {
    const keys = this.repKeys;
    const key = keys[keys.length - 1];
    if (key === undefined) return false;
    const stop = Math.max(0, keys.length - 1 - this.board.halfMoveClock);
    for (let i = keys.length - 3; i >= stop; i -= 2) {
      if (keys[i] === key) return true;
    }
    return false;
  }

  _quiescence(alpha, beta) {
    this._checkTime();
    if (this.abort) return 0;
    const raw = this.evaluator.evaluate(this.board);
    const standPat = this.board.sideToMove === 'w' ? raw : -raw;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const gen = new MoveGenerator(this.board);
    const captures = gen.generateLegalMoves().filter(m => m.pieceCaptured !== '.');
    for (const move of this._order(captures, 0, -1)) {
      if (this.abort) return 0;
      this.board.makeMove(move);
      const score = -this._quiescence(-beta, -alpha);
      this.board.unmakeMove(move);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  // Hash move, then captures and promotions by MVV-LVA, then the two killers
  // for this ply, then the remaining quiet moves by history score. `ply` is -1
  // in quiescence, which has only captures and no killers. Scores are worked
  // out once per move rather than inside the comparator; the sort is stable,
  // so ties keep generation order.
  _order(moves, ttMove, ply) {
    const n = moves.length;
    if (n < 2) return moves;
    const killer1 = this.useKillers && ply >= 0 && ply < MAX_PLY ? this.killers[ply * 2] : 0;
    const killer2 = this.useKillers && ply >= 0 && ply < MAX_PLY ? this.killers[ply * 2 + 1] : 0;
    const side = this.board.sideToMove === 'w' ? 0 : 4096;
    const scored = new Array(n);
    for (let i = 0; i < n; i++) {
      const move = moves[i];
      const code = encodeMove(move);
      let s;
      if (ttMove && code === ttMove) s = ORDER_HASH;
      else if (move.pieceCaptured !== '.' || move.promotionPiece !== '.') s = ORDER_NOISY + noisyScore(move);
      else if (code === killer1) s = ORDER_KILLER_1;
      else if (code === killer2) s = ORDER_KILLER_2;
      else s = this.useHistory ? this.history[side + move.startSq * 64 + move.targetSq] : 0;
      scored[i] = { move, s };
    }
    scored.sort((a, b) => b.s - a.s);
    for (let i = 0; i < n; i++) scored[i] = scored[i].move;
    return scored;
  }

  // A quiet move that refuted a position is likely to refute its siblings
  // (killer) and positions elsewhere in the tree (history). Captures and
  // promotions are already ordered by what they win, so they are left out.
  _rememberCutoff(move, ply, depth) {
    if (move.pieceCaptured !== '.' || move.promotionPiece !== '.') return;
    if (this.useKillers && ply < MAX_PLY) {
      const code = encodeMove(move);
      if (this.killers[ply * 2] !== code) {
        this.killers[ply * 2 + 1] = this.killers[ply * 2];
        this.killers[ply * 2] = code;
      }
    }
    if (this.useHistory) {
      const i = (this.board.sideToMove === 'w' ? 0 : 4096) + move.startSq * 64 + move.targetSq;
      // Deep cutoffs save the most work, so they count the most.
      this.history[i] += depth * depth;
      if (this.history[i] > HISTORY_MAX) {
        for (let j = 0; j < this.history.length; j++) this.history[j] >>= 1;
      }
    }
  }

  // Any knight, bishop, rook or queen for `color`.
  _hasPieces(color) {
    const pieces = color === 'w' ? 'NBRQ' : 'nbrq';
    return this.board.squares.some(p => pieces.includes(p));
  }
}

// MVV-LVA for a capture, plus a bonus for a promotion: 10 to 240.
function noisyScore(move) {
  let s = 0;
  if (move.pieceCaptured !== '.') {
    s += 100 + PIECE_ORDER[move.pieceCaptured] * 10 - PIECE_ORDER[move.pieceMoved];
  }
  if (move.promotionPiece !== '.') s += 50;
  return s;
}

// Hash move first, then MVV-LVA captures, then promotions; quiet moves keep
// generation order. Teaching mode's "MVV-LVA ordering" technique, kept exactly
// as it was so its node counts stay comparable. `ttMove` is the transposition
// table's packed best move, or 0.
export function scoreMove(move, ttMove) {
  let s = 0;
  if (ttMove && encodeMove(move) === ttMove) s = 10000;
  if (move.pieceCaptured !== '.') {
    s += 100 + (PIECE_ORDER[move.pieceCaptured.toLowerCase()] || 0) * 10 - (PIECE_ORDER[move.pieceMoved.toLowerCase()] || 0);
  }
  if (move.promotionPiece !== '.') s += 50;
  return s;
}
