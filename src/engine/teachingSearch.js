// ── Teaching search ───────────────────────────────────────────────────────
// Fixed-depth search where every technique can be switched on or off, so the
// same position can be searched several ways and the node counts compared.
import { MoveGenerator } from './moveGen.js';
import { Evaluation } from './evaluation.js';
import { TranspositionTable, TT_EXACT, TT_ALPHA, TT_BETA } from './transposition.js';
import { scoreMove, NULL_MOVE_R, NULL_MIN_DEPTH } from './search.js';

const MATE = 20000;

export const TECHNIQUES = ['alphaBeta', 'ordering', 'tt', 'quiescence', 'nullMove'];

export function configKey(config) {
  return TECHNIQUES.map(t => (config[t] ? t : '-')).join('|');
}

export class TeachingSearch {
  constructor(board, config, { timeLimitMs = Infinity, onProgress = null, progressIntervalMs = 120 } = {}) {
    this.board = board;
    this.config = config;
    this.evaluator = new Evaluation();
    this.tt = config.tt ? new TranspositionTable() : null;
    this.timeLimitMs = timeLimitMs;
    this.onProgress = onProgress;
    this.progressIntervalMs = progressIntervalMs;
    this.nodes = 0;
    this.aborted = false;
  }

  run(depth) {
    this.startTime = Date.now();
    this.lastProgress = this.startTime;
    this.nodes = 0;
    this.aborted = false;
    const [score, move] = this._root(depth);
    return {
      move: move ? move.toUci() : null,
      score,
      nodes: this.nodes,
      timeMs: Date.now() - this.startTime,
      aborted: this.aborted,
    };
  }

  // Every visited position (root, interior, leaf, quiescence) counts as one node.
  _tick() {
    this.nodes++;
    if ((this.nodes & 1023) !== 0) return;
    const now = Date.now();
    if (now - this.startTime >= this.timeLimitMs) this.aborted = true;
    if (this.onProgress && now - this.lastProgress >= this.progressIntervalMs) {
      this.lastProgress = now;
      this.onProgress({ nodes: this.nodes, timeMs: now - this.startTime });
    }
  }

  _root(depth) {
    this._tick();
    const gen = new MoveGenerator(this.board);
    const moves = gen.generateLegalMoves();
    if (!moves.length) return [gen.isInCheck(this.board.sideToMove) ? -MATE : 0, null];

    let alpha = -Infinity;
    const beta = Infinity;
    let best = null, bestScore = -Infinity;
    for (const move of this._maybeOrder(moves, 0)) {
      this.board.makeMove(move);
      const score = -this._negamax(depth - 1, 1, -beta, -alpha, true);
      this.board.unmakeMove(move);
      if (this.aborted) break; // Keep the best move among fully searched ones
      if (score > bestScore) { bestScore = score; best = move; }
      if (this.config.alphaBeta && score > alpha) alpha = score;
    }
    return [bestScore, best];
  }

  _negamax(depth, ply, alpha, beta, allowNull) {
    this._tick();
    if (this.aborted) return 0;
    const { alphaBeta, quiescence, nullMove } = this.config;

    if (depth <= 0) return quiescence ? this._quiescence(alpha, beta) : this._staticEval();

    let hk = null, ttMove = 0;
    if (this.tt) {
      hk = this.tt.computeHash(this.board);
      const [ttVal, move] = this.tt.lookup(hk, depth, alpha, beta, ply);
      if (ttVal !== null) return ttVal;
      ttMove = move;
    }

    const gen = new MoveGenerator(this.board);
    const moves = gen.generateLegalMoves();
    const stm = this.board.sideToMove;
    if (!moves.length) return gen.isInCheck(stm) ? -MATE + ply : 0;

    // Null move: hand the opponent a free move; if we still beat beta, prune.
    // Same rule as the game search, including how much depth must remain.
    if (nullMove && alphaBeta && allowNull && depth >= NULL_MIN_DEPTH && beta !== Infinity &&
        !gen.isInCheck(stm) && this._hasPieces(stm)) {
      const ep = this.board.enPassant;
      this.board.enPassant = null;
      this.board.sideToMove = stm === 'w' ? 'b' : 'w';
      const score = -this._negamax(depth - 1 - NULL_MOVE_R, ply + 1, -beta, -beta + 1, false);
      this.board.sideToMove = stm;
      this.board.enPassant = ep;
      if (this.aborted) return 0;
      if (score >= beta) return beta;
    }

    const origAlpha = alpha;
    let bestScore = -Infinity, bestMove = null;
    for (const move of this._maybeOrder(moves, ttMove)) {
      this.board.makeMove(move);
      const score = -this._negamax(depth - 1, ply + 1, -beta, -alpha, true);
      this.board.unmakeMove(move);
      if (this.aborted) return 0;
      if (score > bestScore) { bestScore = score; bestMove = move; }
      if (alphaBeta) {
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }
    }

    if (this.tt) {
      const flag = bestScore <= origAlpha ? TT_ALPHA : bestScore >= beta ? TT_BETA : TT_EXACT;
      this.tt.store(hk, depth, bestScore, flag, bestMove, ply);
    }
    return bestScore;
  }

  _quiescence(alpha, beta) {
    this._tick();
    if (this.aborted) return 0;
    const { alphaBeta } = this.config;
    const standPat = this._staticEval();
    if (alphaBeta) {
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
    }

    let best = standPat;
    const captures = new MoveGenerator(this.board).generateLegalMoves().filter(m => m.pieceCaptured !== '.');
    for (const move of this._maybeOrder(captures, 0)) {
      this.board.makeMove(move);
      const score = -this._quiescence(-beta, -alpha);
      this.board.unmakeMove(move);
      if (this.aborted) return 0;
      if (alphaBeta) {
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      } else if (score > best) {
        best = score;
      }
    }
    return alphaBeta ? alpha : best;
  }

  _staticEval() {
    const raw = this.evaluator.evaluate(this.board);
    return this.board.sideToMove === 'w' ? raw : -raw;
  }

  // Array#sort is stable, so equal-scored moves keep generation order.
  _maybeOrder(moves, ttMove) {
    if (!this.config.ordering) return moves;
    return moves.slice().sort((a, b) => scoreMove(b, ttMove) - scoreMove(a, ttMove));
  }

  _hasPieces(color) {
    const pieces = color === 'w' ? 'NBRQ' : 'nbrq';
    return this.board.squares.some(p => pieces.includes(p));
  }
}
