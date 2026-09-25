// Builds a tactical test suite: positions with one clearly best move, as judged
// by full-strength Stockfish. Written because none of the classic suites (WAC,
// ECM) could be fetched from this environment; the method is the same idea —
// a position counts only when the best move is decisively better than the rest.
//
//   node bench/make-tactics.js --count 40 --out bench/positions/tactics-1.epd
//
// Each game starts from one of the book openings and is continued by a weak
// Stockfish (Skill Level 2), which makes the mistakes tactics are made of. Every
// position along the way gets a quick depth-8 look with two principal
// variations; the promising ones are analysed again at depth 16 by full-strength
// Stockfish, and a position is kept when either
//   - the best move mates in 3 or fewer and the runner-up does not also mate, or
//   - the best move is at least 150 cp better than the runner-up and the
//     position is not already decided (best score between -200 and +600).
// Plain recaptures of a piece just taken are dropped as too easy, and at most
// one position is taken from each game.
import { appendFileSync, writeFileSync } from 'node:fs';
import { Board } from '../src/engine/board.js';
import { MoveGenerator } from '../src/engine/moveGen.js';
import { toSan } from '../src/engine/san.js';
import { OPENINGS, openingMoves } from './openings.js';
import { UciEngine, stockfishPath } from './uci.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const COUNT = Number(arg('count', 40));
const OUT = arg('out', 'bench/positions/tactics.epd');
const DEPTH = Number(arg('depth', 16));

const asCp = (info) => (info.mate !== undefined ? Math.sign(info.mate) * (10000 - Math.abs(info.mate)) : info.cp);

const path = stockfishPath();
const player = new UciEngine(path);
const analyst = new UciEngine(path);
await player.init({ 'Skill Level': 2 });
await analyst.init({ MultiPV: 2, Hash: 64 });

const verdict = async (fen, depth) => {
  await analyst.newGame();
  const { infos } = await analyst.go({ fen }, `depth ${depth}`);
  const deepest = Math.max(...infos.map(i => i.depth));
  const pv1 = infos.findLast(i => i.depth === deepest && i.multipv === 1);
  const pv2 = infos.findLast(i => i.depth === deepest && i.multipv === 2);
  if (!pv1 || !pv2) return null;
  const gap = asCp(pv1) - asCp(pv2);
  const mate = pv1.mate > 0 && pv1.mate <= 3 && !(pv2.mate > 0);
  const material = pv1.mate === undefined && gap >= 150 && pv1.cp >= -200 && pv1.cp <= 600;
  return { pv1, gap, kind: mate ? 'mate' : material ? 'material' : null };
};

const isRecapture = (move, last) =>
  move && last && last.pieceCaptured !== '.' && move.pieceCaptured !== '.' && move.targetSq === last.targetSq;

writeFileSync(OUT, '');
const kept = [];
let games = 0;
while (kept.length < COUNT) {
  games++;
  const [name, line] = OPENINGS[Math.floor(Math.random() * OPENINGS.length)];
  const board = new Board();
  for (const uci of openingMoves(line)) board.makeMove(new MoveGenerator(board).generateLegalMoves().find(m => m.toUci() === uci));

  let last = null;
  for (let ply = 0; ply < 50; ply++) {
    const legal = new MoveGenerator(board).generateLegalMoves();
    if (!legal.length) break;
    const fen = board.toFen();
    if (ply >= 2 && legal.length >= 2) {
      const quick = await verdict(fen, 8);
      if (quick?.kind && !isRecapture(legal.find(m => m.toUci() === quick.pv1.pv[0]), last)) {
        const deep = await verdict(fen, DEPTH);
        const move = deep && legal.find(m => m.toUci() === deep.pv1.pv[0]);
        if (deep?.kind && !isRecapture(move, last)) {
          const score = deep.pv1.mate !== undefined ? `mate ${deep.pv1.mate}` : `cp ${deep.pv1.cp}`;
          const entry = `${fen.split(' ').slice(0, 4).join(' ')} bm ${toSan(board, move, legal)}; c0 "${deep.kind}"; c1 "sf${DEPTH} ${score}, gap ${deep.gap}"; c2 "from ${name}";`;
          kept.push(entry);
          appendFileSync(OUT, entry + '\n');
          console.error(`${kept.length}/${COUNT} (game ${games}, ply ${ply})  ${entry}`);
          break;
        }
      }
    }
    await player.newGame();
    const { bestmove } = await player.go({ fen }, 'movetime 20');
    last = legal.find(m => m.toUci() === bestmove);
    board.makeMove(last);
  }
}

player.quit();
analyst.quit();
