// Solves an EPD test suite at a fixed time per position.
//
//   node bench/suite.js --engine foai --movetime 1000 [--epd bench/positions/tactics.epd]
//
// A position counts as solved when the engine's move is the suite's best move
// ("bm"). --engine takes the same forms as bench/match.js (foai, foai:<options>,
// foai@<dir>).
import { readFileSync } from 'node:fs';
import { Board } from '../src/engine/board.js';
import { normalizeFen } from '../src/engine/fen.js';
import { parseMove } from '../src/engine/san.js';
import { FoaiPlayer } from './match.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const spec = arg('engine', 'foai');
const movetime = Number(arg('movetime', 1000));
const epd = arg('epd', 'bench/positions/tactics.epd');

const player = new FoaiPlayer(spec);
await player.init();

const lines = readFileSync(epd, 'utf8').trim().split('\n');
let solved = 0, depth = 0;
const byKind = {};
for (const line of lines) {
  const [fen, ops] = line.split(' bm ');
  const bm = ops.split(';')[0].trim();
  const kind = /c0 "([^"]+)"/.exec(ops)?.[1] ?? 'all';
  const board = new Board();
  board.parseFen(normalizeFen(fen));
  const want = parseMove(board, bm).move.toUci();
  player.newGame();
  const r = player.move(normalizeFen(fen), [board.positionKey()], movetime);
  const ok = r.uci === want;
  solved += ok;
  depth += r.depth;
  byKind[kind] = byKind[kind] || [0, 0];
  byKind[kind][0] += ok;
  byKind[kind][1]++;
}
const kinds = Object.entries(byKind).map(([k, [s, n]]) => `${k} ${s}/${n}`).join(', ');
console.log(`${spec.padEnd(24)} ${movetime} ms  solved ${solved}/${lines.length} (${kinds})  mean depth ${(depth / lines.length).toFixed(2)}`);
