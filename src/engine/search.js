import { MoveGenerator } from './moveGen.js';
import { Evaluation } from './evaluation.js';
import { TranspositionTable, TT_EXACT, TT_ALPHA, TT_BETA } from './transposition.js';

const PIECE_ORDER = { P:1, N:3, B:3, R:5, Q:9, K:100, p:1, n:3, b:3, r:5, q:9, k:100, '.':0 };

export class SearchEngine {
  // positionHistory is every position the real game has already stood in, oldest
  // first, ending with the position at the root. Without it the search can only
  // see repetitions inside its own tree, and would miss that a line repeats a
  // position the game has already been in twice.
  constructor(board, positionHistory = []) {
    this.board = board;
    this.gameHistory = positionHistory;
    this.evaluator = new Evaluation();
    this.tt = new TranspositionTable();
    this.nodes = 0;
    this.maxDepth = 0;
    this.startTime = 0;
    this.timeLimitMs = 2000;
    this.abort = false;
    this.onProgress = null;
    this.repKeys = [];
  }

  getBestMove(timeLimitMs = 2000, onProgress = null) {
    this.timeLimitMs = timeLimitMs;
    this.onProgress = onProgress;
    this.startTime = Date.now();
    this.nodes = 0;
    this.abort = false;
    this.repKeys = [...this.gameHistory];

    let bestMove = null;
    let finalScore = 0;

    for (let depth = 1; depth <= 12; depth++) {
      if (Date.now() - this.startTime >= this.timeLimitMs) break;
      this.maxDepth = depth;
      const [score, move] = this._root(depth, -Infinity, Infinity);
      if (this.abort) break;
      if (move) { bestMove = move; finalScore = score; }
      if (onProgress) onProgress({ depth, score, nodes: this.nodes, time: Date.now() - this.startTime, move: move ? move.toUci() : null });
      if (Math.abs(score) > 15000) break; // Forced mate
    }

    return { bestMove, depth: this.maxDepth, nodes: this.nodes, score: finalScore };
  }

  _checkTime() {
    this.nodes++;
    if ((this.nodes & 2047) === 0 && Date.now() - this.startTime >= this.timeLimitMs) {
      this.abort = true;
    }
  }

  _root(depth, alpha, beta) {
    const gen = new MoveGenerator(this.board);
    const moves = gen.generateLegalMoves();
    if (!moves.length) return [0, null];

    const hk = this.tt.computeHash(this.board);
    const [, ttMove] = this.tt.lookup(hk, depth, alpha, beta);
    const ordered = this._order(moves, ttMove);

    let best = null, bestScore = -Infinity;
    for (const move of ordered) {
      this.board.makeMove(move);
      this.repKeys.push(this.board.positionKey());
      const score = -this._negamax(depth - 1, -beta, -alpha);
      this.repKeys.pop();
      this.board.unmakeMove(move);
      if (score > bestScore) { bestScore = score; best = move; }
      if (score > alpha) alpha = score;
    }
    this.tt.store(hk, depth, bestScore, TT_EXACT, best);
    return [bestScore, best];
  }

  _negamax(depth, alpha, beta) {
    this._checkTime();
    if (this.abort) return 0;

    // Before the transposition probe, which would otherwise hand back a score
    // for this position and hide the fact that the line has repeated it.
    if (this._isRepetition()) return 0;

    const hk = this.tt.computeHash(this.board);
    const [ttVal, ttMove] = this.tt.lookup(hk, depth, alpha, beta);
    if (ttVal !== null) return ttVal;

    if (depth === 0) return this._quiescence(alpha, beta);

    const gen = new MoveGenerator(this.board);
    const moves = gen.generateLegalMoves();
    if (!moves.length) {
      return gen.isInCheck(this.board.sideToMove) ? -20000 + (this.maxDepth - depth) : 0;
    }

    const ordered = this._order(moves, ttMove);
    let bestScore = -Infinity, origAlpha = alpha, bestMove = null;

    for (const move of ordered) {
      if (this.abort) return 0;
      this.board.makeMove(move);
      this.repKeys.push(this.board.positionKey());
      const score = -this._negamax(depth - 1, -beta, -alpha);
      this.repKeys.pop();
      this.board.unmakeMove(move);
      if (score > bestScore) { bestScore = score; bestMove = move; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }

    const flag = bestScore <= origAlpha ? TT_ALPHA : bestScore >= beta ? TT_BETA : TT_EXACT;
    this.tt.store(hk, depth, bestScore, flag, bestMove);
    return bestScore;
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
    for (const move of this._order(captures, null)) {
      if (this.abort) return 0;
      this.board.makeMove(move);
      const score = -this._quiescence(-beta, -alpha);
      this.board.unmakeMove(move);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  _order(moves, ttMove) {
    return moves.slice().sort((a, b) => scoreMove(b, ttMove) - scoreMove(a, ttMove));
  }
}

// Hash move first, then MVV-LVA captures, then promotions.
export function scoreMove(move, ttMove) {
  let s = 0;
  if (ttMove && move.equals(ttMove)) s = 10000;
  if (move.pieceCaptured !== '.') {
    s += 100 + (PIECE_ORDER[move.pieceCaptured.toLowerCase()] || 0) * 10 - (PIECE_ORDER[move.pieceMoved.toLowerCase()] || 0);
  }
  if (move.promotionPiece !== '.') s += 50;
  return s;
}
