// Engine matches at a fixed time per move, and an Elo estimate from them.
//
//   node bench/match.js --player foai --opponents sf:1320,sf:1500 --movetime 1000 --rounds 40
//
// Engines are written as
//   foai                     this engine, as the app runs it
//   foai:nullMove=false      … with SearchEngine options overridden
//   foai@<dir>               an engine from another directory (e.g. an older
//                            copy of src/engine), for before/after matches
//   sf:<elo>                 Stockfish with UCI_LimitStrength at that UCI_Elo
//                            (1320–3190), calibrated by the Stockfish team
//   sf                       Stockfish at full strength
//
// Every opening in bench/openings.js is played twice, once with each colour,
// so a match of --rounds R is 2R games against each opponent. Games run in
// parallel worker threads (--workers, default: one per core less one); each
// thread plays its games one after another, so an engine always has a core
// to itself while it thinks.
//
// A game ends on checkmate, stalemate, threefold repetition, the fifty-move
// rule or insufficient material, exactly as in the app, or is called a draw
// after --max-plies (default 300). Results go to --out as JSON, and the games
// to --pgn for replaying in any chess program.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Board, hasThreefoldRepetition } from '../src/engine/board.js';
import { MoveGenerator } from '../src/engine/moveGen.js';
import { lineToSan } from '../src/engine/san.js';
import { OPENINGS, openingMoves } from './openings.js';
import { UciEngine, stockfishPath } from './uci.js';

const ENGINE_DIR = fileURLToPath(new URL('../src/engine/', import.meta.url));

// ── Players ───────────────────────────────────────────────────────────────
export class FoaiPlayer {
  constructor(spec) {
    const [head, ...opts] = spec.split(':');
    const at = head.indexOf('@');
    this.dir = at >= 0 ? resolve(head.slice(at + 1)) : ENGINE_DIR;
    this.options = Object.fromEntries(opts.flatMap(o => o.split(',')).map(o => {
      const [k, v] = o.split('=');
      return [k, v === 'true' ? true : v === 'false' ? false : Number(v)];
    }));
  }

  async init() {
    const load = (f) => import(pathToFileURL(resolve(this.dir, f)).href);
    ({ Board: this.Board } = await load('board.js'));
    ({ SearchEngine: this.SearchEngine } = await load('search.js'));
    ({ TranspositionTable: this.TT } = await load('transposition.js'));
    // Engines with a fixed-size table keep one for the whole game, as the app does.
    this.persistentTT = typeof this.TT.prototype.newSearch === 'function';
  }

  newGame() { this.tt = this.persistentTT ? new this.TT() : null; }

  move(fen, keys, movetime) {
    const board = new this.Board();
    board.parseFen(fen);
    const options = { ...this.options, ...(this.tt ? { tt: this.tt } : {}) };
    const { bestMove, depth } = new this.SearchEngine(board, keys, options).getBestMove(movetime);
    return { uci: bestMove.toUci(), depth };
  }

  quit() {}
}

class StockfishPlayer {
  constructor(spec) {
    this.elo = spec.includes(':') ? Number(spec.split(':')[1]) : null;
  }

  async init() {
    this.engine = new UciEngine(stockfishPath(workerData?.argv ?? process.argv));
    await this.engine.init(this.elo ? { UCI_LimitStrength: true, UCI_Elo: this.elo } : {});
  }

  async newGame() { await this.engine.newGame(); }

  async move(fen, keys, movetime, startFen, moves) {
    const { bestmove, infos } = await this.engine.go({ fen: startFen, moves }, `movetime ${movetime}`);
    return { uci: bestmove, depth: infos.at(-1)?.depth };
  }

  quit() { this.engine.quit(); }
}

const makePlayer = (spec) => (spec.startsWith('sf') ? new StockfishPlayer(spec) : new FoaiPlayer(spec));

// ── One game ──────────────────────────────────────────────────────────────
function gameEnd(board, keys) {
  const gen = new MoveGenerator(board);
  if (!gen.generateLegalMoves().length) {
    return gen.isInCheck(board.sideToMove)
      ? { result: board.sideToMove === 'w' ? '0-1' : '1-0', reason: 'checkmate' }
      : { result: '1/2-1/2', reason: 'stalemate' };
  }
  if (hasThreefoldRepetition(keys)) return { result: '1/2-1/2', reason: 'threefold repetition' };
  if (board.halfMoveClock >= 100) return { result: '1/2-1/2', reason: 'fifty-move rule' };
  const pieces = board.squares.filter(p => p !== '.');
  const types = new Set(pieces.map(p => p.toLowerCase()));
  if (pieces.length <= 3 && [...types].every(t => 'kbn'.includes(t))) {
    return { result: '1/2-1/2', reason: 'insufficient material' };
  }
  return null;
}

async function playGame(white, black, opening, { movetime, maxPlies }) {
  const board = new Board();
  const moves = [...opening];
  for (const uci of moves) {
    board.makeMove(new MoveGenerator(board).generateLegalMoves().find(m => m.toUci() === uci));
  }
  // Repetition history, as the app keeps it: every position of the game so far.
  const replay = new Board();
  const keys = [replay.positionKey()];
  for (const uci of moves) {
    replay.makeMove(new MoveGenerator(replay).generateLegalMoves().find(m => m.toUci() === uci));
    keys.push(replay.positionKey());
  }

  await white.newGame();
  await black.newGame();
  const depths = { w: [], b: [] };
  const startFen = new Board().toFen();
  while (true) {
    const end = gameEnd(board, keys);
    if (end) return { ...end, moves, plies: moves.length, depths };
    if (moves.length >= maxPlies) return { result: '1/2-1/2', reason: 'move limit', moves, plies: moves.length, depths };

    const side = board.sideToMove;
    const player = side === 'w' ? white : black;
    const { uci, depth } = await player.move(board.toFen(), keys, movetime, startFen, moves);
    const move = new MoveGenerator(board).generateLegalMoves().find(m => m.toUci() === uci);
    if (!move) {
      return { result: side === 'w' ? '0-1' : '1-0', reason: `illegal move ${uci}`, moves, plies: moves.length, depths };
    }
    board.makeMove(move);
    moves.push(uci);
    keys.push(board.positionKey());
    if (depth) depths[side].push(depth);
  }
}

// ── Worker thread: plays the games it is handed ─────────────────────────────
if (!isMainThread) {
  const { player: playerSpec, jobs, movetime, maxPlies } = workerData;
  // The player and its opponent are separate instances even when they are the
  // same engine, so neither shares the other's transposition table.
  const players = new Map();
  const get = async (spec, role) => {
    const key = `${role} ${spec}`;
    if (!players.has(key)) { const p = makePlayer(spec); await p.init(); players.set(key, p); }
    return players.get(key);
  };
  for (const job of jobs) {
    const me = await get(playerSpec, 'player');
    const them = await get(job.opponent, 'opponent');
    const [white, black] = job.playerWhite ? [me, them] : [them, me];
    const game = await playGame(white, black, job.opening, { movetime, maxPlies });
    parentPort.postMessage({ ...job, ...game });
  }
  for (const p of players.values()) p.quit();
  process.exit(0);
}

// ── Main thread: schedule, collect, report ─────────────────────────────────
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

// Expected score against an opponent `diff` Elo stronger.
const expected = (diff) => 1 / (1 + 10 ** (diff / 400));

// 95% interval for the Elo difference of a W/D/L record, from the standard
// error of the mean game score (each game scoring 1, ½ or 0).
export function eloInterval(wins, draws, losses) {
  const n = wins + draws + losses;
  const mean = (wins + draws / 2) / n;
  const variance = (wins * (1 - mean) ** 2 + draws * (0.5 - mean) ** 2 + losses * mean ** 2) / n;
  const se = Math.sqrt(variance / n);
  const elo = (s) => (s <= 0 ? -Infinity : s >= 1 ? Infinity : -400 * Math.log10(1 / s - 1));
  return [elo(mean - 1.96 * se), elo(mean), elo(mean + 1.96 * se)].map(Math.round);
}

export function eloFromScore(score, n) {
  const p = score / n;
  const elo = (s) => (s <= 0 ? -Infinity : s >= 1 ? Infinity : -400 * Math.log10(1 / s - 1));
  return elo(p);
}

// Maximum-likelihood rating against opponents of known rating, with a 95%
// interval from the curvature of the log-likelihood at the maximum.
export function maximumLikelihoodElo(results) {
  const logL = (r) => results.reduce((sum, { rating, points, games }) => {
    const e = expected(rating - r);
    return sum + points * Math.log(e) + (games - points) * Math.log(1 - e);
  }, 0);
  let lo = -1000, hi = 4000;
  for (let i = 0; i < 200; i++) { // Golden-section search; logL is concave
    const a = lo + (hi - lo) * 0.382, b = lo + (hi - lo) * 0.618;
    if (logL(a) < logL(b)) lo = a; else hi = b;
  }
  const r = (lo + hi) / 2;
  const k = Math.LN10 / 400;
  const info = results.reduce((sum, { rating, games }) => {
    const e = expected(rating - r);
    return sum + games * e * (1 - e) * k * k;
  }, 0);
  const se = 1 / Math.sqrt(info);
  return { elo: Math.round(r), margin: Math.round(1.96 * se) };
}

function summarize(games, playerSpec) {
  const byOpponent = new Map();
  for (const g of games) {
    const s = byOpponent.get(g.opponent) || { opponent: g.opponent, wins: 0, draws: 0, losses: 0, reasons: {}, depth: [], plies: 0 };
    const won = (g.result === '1-0') === g.playerWhite;
    if (g.result === '1/2-1/2') s.draws++; else if (won) s.wins++; else s.losses++;
    s.reasons[g.reason] = (s.reasons[g.reason] || 0) + 1;
    s.depth.push(...(g.playerWhite ? g.depths.w : g.depths.b));
    s.plies += g.plies;
    byOpponent.set(g.opponent, s);
  }
  const rows = [...byOpponent.values()].map(s => {
    const n = s.wins + s.draws + s.losses;
    const points = s.wins + s.draws / 2;
    const diff = eloFromScore(points, n);
    return {
      ...s, depth: undefined, games: n, points,
      score: points / n,
      eloDiff: Number.isFinite(diff) ? Math.round(diff) : diff > 0 ? '+∞' : '−∞',
      eloInterval: eloInterval(s.wins, s.draws, s.losses),
      avgDepth: s.depth.length ? +(s.depth.reduce((a, b) => a + b, 0) / s.depth.length).toFixed(2) : null,
      avgPlies: Math.round(s.plies / n),
    };
  });
  const anchored = rows.filter(r => /^sf:\d+$/.test(r.opponent))
    .map(r => ({ rating: Number(r.opponent.split(':')[1]), points: r.points, games: r.games }));
  // With every game won (or lost) the likelihood has no maximum; say so instead.
  const won = anchored.reduce((a, r) => a + r.points, 0), played = anchored.reduce((a, r) => a + r.games, 0);
  const rating = !anchored.length ? null
    : won === played ? { above: Math.max(...anchored.map(r => r.rating)) }
    : won === 0 ? { below: Math.min(...anchored.map(r => r.rating)) }
    : maximumLikelihoodElo(anchored);
  return { player: playerSpec, rows, rating };
}

function toPgn(g, player, movetime) {
  const [white, black] = g.playerWhite ? [player, g.opponent] : [g.opponent, player];
  const moves = lineToSan(new Board(), g.moves)
    .map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ');
  return [
    '[Event "FOAI engine benchmark"]', `[White "${white}"]`, `[Black "${black}"]`, `[Result "${g.result}"]`,
    `[Opening "${g.openingName}"]`, `[TimeControl "${movetime} ms per move"]`, `[Termination "${g.reason}"]`,
    '', `${moves} ${g.result}`, '',
  ].join('\n');
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const player = arg('player', 'foai');
  const opponents = arg('opponents', 'sf:1320').split(',');
  const movetime = Number(arg('movetime', 1000));
  const rounds = Math.min(Number(arg('rounds', OPENINGS.length)), OPENINGS.length);
  const maxPlies = Number(arg('max-plies', 300));
  const workers = Number(arg('workers', Math.max(1, availableParallelism() - 1)));
  const out = arg('out', null);
  const pgn = arg('pgn', null);

  const jobs = [];
  for (const opponent of opponents) {
    for (let i = 0; i < rounds; i++) {
      const [name, line] = OPENINGS[i];
      for (const playerWhite of [true, false]) jobs.push({ opponent, openingName: name, opening: openingMoves(line), playerWhite });
    }
  }
  // Deal the games round-robin so every thread gets a similar mix.
  const shards = Array.from({ length: workers }, (_, w) => jobs.filter((_, i) => i % workers === w));

  const started = Date.now();
  const games = [];
  await Promise.all(shards.filter(s => s.length).map(shard => new Promise((done, fail) => {
    const w = new Worker(fileURLToPath(import.meta.url), {
      workerData: { player, jobs: shard, movetime, maxPlies, argv: process.argv },
    });
    w.on('message', (g) => {
      games.push(g);
      const won = g.result === '1/2-1/2' ? '½' : ((g.result === '1-0') === g.playerWhite ? '1' : '0');
      console.error(`[${games.length}/${jobs.length}] vs ${g.opponent.padEnd(8)} ${g.playerWhite ? 'W' : 'B'} ${won}  ${g.reason.padEnd(21)} ${String(g.plies).padStart(3)} plies  ${g.openingName}`);
    });
    w.on('error', fail);
    w.on('exit', done);
  })));

  const summary = summarize(games, player);
  console.log(`\n${player}, ${movetime} ms per move, ${games.length} games in ${Math.round((Date.now() - started) / 60000)} min`);
  console.log('opponent   games    +    =    −   score   Elo diff  avg depth');
  for (const r of summary.rows) {
    console.log(`${r.opponent.padEnd(10)} ${String(r.games).padStart(5)} ${String(r.wins).padStart(4)} ${String(r.draws).padStart(4)} ${String(r.losses).padStart(4)}   ${(r.score * 100).toFixed(1).padStart(5)}%  ${String(r.eloDiff).padStart(8)}  ${String(r.avgDepth).padStart(9)}`);
  }
  const { rating } = summary;
  if (rating?.elo !== undefined) console.log(`\nEstimated rating: ${rating.elo} ± ${rating.margin} (95%), on Stockfish's UCI_Elo scale`);
  if (rating?.above) console.log(`\nWon every game: stronger than ${rating.above}, but by how much these games cannot say.`);
  if (rating?.below) console.log(`\nLost every game: weaker than ${rating.below}, but by how much these games cannot say.`);
  if (out) writeFileSync(out, JSON.stringify({ movetime, maxPlies, ...summary, games }, null, 1));
  if (pgn) writeFileSync(pgn, games.map(g => toPgn(g, player, movetime)).join('\n'));
}
