// Self-play games for Texel tuning: positions labelled with how the game ended.
//
//   node bench/datagen.js --minutes 75 --movetime 40 --out bench/data/selfplay.txt
//
// Texel tuning (Peter Österlund, 2014) fits the evaluation so that a sigmoid of
// it predicts the result of the game a position came from. Like the original,
// the games here are the engine's own, at a fast time per move. Each game starts
// from one of the 40 openings in bench/openings.js followed by 2–8 random
// moves, so no two games are alike, and is discarded if those moves left one
// side clearly ahead (more than 2 pawns at a 4-ply search).
//
// A position is kept when it is quiet, as the tuner's static evaluation can
// only judge quiet positions: the side to move is not in check and the move
// the engine chose is not a capture or a promotion. Positions where the
// search had already found a mate are dropped too.
//
// Games end as in bench/match.js, and are also adjudicated to save time: a win
// once the score has stayed beyond ±10 pawns for 6 plies, a draw at 400 plies.
//
// Output: one line per position, "<FEN>;<result>;<game>", the result from
// White's side (1, 0.5 or 0) and the game's number, which the tuner uses to
// hold out whole games: neighbouring positions of one game are near copies
// with the same result, so holding out single positions would test the fit on
// what it was trained on. Lines are appended as games finish, so a run can be
// stopped at any time and what it wrote is usable.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Board, hasThreefoldRepetition } from '../src/engine/board.js';
import { MoveGenerator } from '../src/engine/moveGen.js';
import { SearchEngine } from '../src/engine/search.js';
import { TranspositionTable } from '../src/engine/transposition.js';
import { OPENINGS, openingMoves } from './openings.js';

const MATE_BOUND = 15000;
const ADJUDICATE_SCORE = 1000;
const ADJUDICATE_PLIES = 6;
const MAX_PLIES = 400;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gameOver(board, keys, legal) {
  if (!legal.length) {
    if (new MoveGenerator(board).isInCheck(board.sideToMove)) return board.sideToMove === 'w' ? 0 : 1;
    return 0.5;
  }
  if (hasThreefoldRepetition(keys) || board.halfMoveClock >= 100) return 0.5;
  const pieces = board.squares.filter(p => p !== '.');
  if (pieces.length <= 3 && pieces.every(p => 'kbnKBN'.includes(p))) return 0.5;
  return null;
}

// One game. Returns { result, positions } or null if the opening was unbalanced.
function playGame(id, { seed, movetime }, tts) {
  const rand = mulberry32(seed * 1_000_003 + id);
  const board = new Board();
  const keys = [board.positionKey()];
  const play = (move) => { board.makeMove(move); keys.push(board.positionKey()); };

  const [, line] = OPENINGS[Math.floor(rand() * OPENINGS.length)];
  for (const uci of openingMoves(line)) {
    play(new MoveGenerator(board).generateLegalMoves().find(m => m.toUci() === uci));
  }
  const randomPlies = 2 + Math.floor(rand() * 7);
  for (let i = 0; i < randomPlies; i++) {
    const legal = new MoveGenerator(board).generateLegalMoves();
    if (!legal.length) return null;
    play(legal[Math.floor(rand() * legal.length)]);
  }
  if (gameOver(board, keys, new MoveGenerator(board).generateLegalMoves()) !== null) return null;
  const check = new SearchEngine(board, keys, { tt: new TranspositionTable(12) }).getBestMove(Infinity, null, { maxDepth: 4 });
  if (Math.abs(check.score) > 200) return null;

  for (const tt of tts) tt.clear();
  const positions = [];
  let streak = 0, streakSign = 0;
  for (let ply = 0; ; ply++) {
    const legal = new MoveGenerator(board).generateLegalMoves();
    const over = gameOver(board, keys, legal);
    if (over !== null) return { result: over, positions };
    if (ply >= MAX_PLIES) return { result: 0.5, positions };

    const tt = tts[board.sideToMove === 'w' ? 0 : 1];
    const fen = board.toFen();
    const inCheck = new MoveGenerator(board).isInCheck(board.sideToMove);
    const { bestMove, score } = new SearchEngine(board, keys, { tt }).getBestMove(movetime);
    const quiet = !inCheck && bestMove.pieceCaptured === '.' && bestMove.promotionPiece === '.';
    if (quiet && Math.abs(score) < MATE_BOUND) positions.push(fen);

    // Adjudication, on the score from White's side.
    const white = board.sideToMove === 'w' ? score : -score;
    const sign = white >= ADJUDICATE_SCORE ? 1 : white <= -ADJUDICATE_SCORE ? -1 : 0;
    streak = sign !== 0 && sign === streakSign ? streak + 1 : sign !== 0 ? 1 : 0;
    streakSign = sign;
    if (streak >= ADJUDICATE_PLIES) return { result: sign > 0 ? 1 : 0, positions };

    play(bestMove);
  }
}

// ── Worker thread: asks for game numbers until told to stop ────────────────
if (!isMainThread) {
  // One table per side, cleared between games, as each player in a match keeps its own.
  const tts = [new TranspositionTable(), new TranspositionTable()];
  parentPort.on('message', (msg) => {
    if (msg.type === 'stop') process.exit(0);
    const game = playGame(msg.id, workerData, tts);
    parentPort.postMessage({ id: msg.id, game });
  });
  parentPort.postMessage({ ready: true });
}

// ── Main thread ──────────────────────────────────────────────────────────────
if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
  };
  const minutes = Number(arg('minutes', 60));
  const maxGames = Number(arg('games', Infinity));
  const movetime = Number(arg('movetime', 40));
  const seed = Number(arg('seed', 1));
  const workers = Number(arg('workers', availableParallelism()));
  const out = arg('out', 'bench/data/selfplay.txt');

  mkdirSync(dirname(out), { recursive: true });
  const stream = createWriteStream(out, { flags: 'a' });
  const deadline = Date.now() + minutes * 60_000;
  const started = Date.now();
  let nextId = Number(arg('first-game', 0));
  let games = 0, skipped = 0, positions = 0;
  const results = { 1: 0, 0.5: 0, 0: 0 };

  await Promise.all(Array.from({ length: workers }, () => new Promise((done, fail) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { seed, movetime } });
    const next = () => {
      if (Date.now() >= deadline || games + skipped >= maxGames) w.postMessage({ type: 'stop' });
      else w.postMessage({ type: 'play', id: nextId++ });
    };
    w.on('message', (msg) => {
      if (msg.ready) return next();
      if (!msg.game) { skipped++; return next(); }
      const { result, positions: fens } = msg.game;
      games++;
      results[result]++;
      positions += fens.length;
      stream.write(fens.map(f => `${f};${result};${msg.id}\n`).join(''));
      if (games % 25 === 0) {
        const mins = (Date.now() - started) / 60000;
        console.error(`${games} games (${skipped} openings skipped), ${positions} positions, ${mins.toFixed(1)} min — `
          + `White ${results[1]} / draws ${results[0.5]} / Black ${results[0]}`);
      }
      next();
    });
    w.on('error', fail);
    w.on('exit', done);
  })));
  stream.end();
  console.log(`${games} games, ${positions} positions in ${((Date.now() - started) / 60000).toFixed(1)} min `
    + `(White ${results[1]}, draws ${results[0.5]}, Black ${results[0]}; ${skipped} unbalanced openings skipped) → ${out}`);
}
