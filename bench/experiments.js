// Teaching-mode experiments over many positions and depths.
//
//   node bench/experiments.js --max-depth 6 --out bench/results/experiments.json
//
// Every position is searched by TeachingSearch at every depth from 1 to
// --max-depth under each configuration below. A configuration stops going
// deeper once one search passes --limit seconds (default 60, as in teaching
// mode); that search is kept and marked as a lower bound. Positions run in
// parallel worker threads, one per core, so node counts are exact and times are
// single-core times.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Board } from '../src/engine/board.js';
import { TeachingSearch } from '../src/engine/teachingSearch.js';

export const POSITIONS = [
  // Openings
  { name: 'Start position', phase: 'opening', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  { name: 'Italian', phase: 'opening', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3' },
  { name: 'Sicilian Najdorf', phase: 'opening', fen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6' },
  { name: "Queen's Gambit Declined", phase: 'opening', fen: 'rnbqk2r/ppp1bppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR w KQkq - 4 5' },
  // Middlegames (the standard perft positions double as busy middlegames)
  { name: 'Kiwipete', phase: 'middlegame', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1' },
  { name: 'Perft position 4', phase: 'middlegame', fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1' },
  { name: 'Perft position 5', phase: 'middlegame', fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8' },
  { name: 'Perft position 6', phase: 'middlegame', fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10' },
  // Tactics
  { name: 'Opera Game, mate in 2', phase: 'tactic', fen: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16', best: 'b3b8' },
  { name: 'Win at Chess #1', phase: 'tactic', fen: '2rr3k/pp3pp1/1nnqbN1p/3pN3/2pP4/2P3Q1/PPB4P/R4RK1 w - - 0 1', best: 'g3g6' },
  { name: 'Win at Chess #4', phase: 'tactic', fen: 'r1bq2rk/pp3pbp/2p1p1pQ/7P/3P4/2PB1N2/PP3PPR/2KR4 w - - 0 1', best: 'h6h7' },
  { name: 'Suite FOAI-T.082 (Nd6)', phase: 'tactic', fen: '2r5/3pkp1p/1p2p3/1N2P3/Rb2bp2/8/1Pn3PP/2K2B1R w - - 0 1', best: 'b5d6' },
  { name: 'Suite FOAI-T.085 (Bh3)', phase: 'tactic', fen: 'r3k2r/pp1N4/6p1/2p4p/4p1B1/2P5/P1P2PPP/4K2R w Kkq h6 0 1', best: 'g4h3' },
  // Endgames
  { name: 'Rook endgame (perft 3)', phase: 'endgame', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1' },
  { name: 'Fine #70 (pawn endgame)', phase: 'endgame', fen: '8/k7/3p4/p2P1p2/P2P1P2/8/8/K7 w - - 0 1', best: 'a1b1' },
  { name: 'King and pawn', phase: 'endgame', fen: '8/8/4k3/8/2K1P3/8/8/8 w - - 0 1' },
  { name: 'Queen vs rook', phase: 'endgame', fen: '8/8/8/3k4/8/4r3/8/2QK4 w - - 0 1' },
];

const OFF = { alphaBeta: false, ordering: false, tt: false, quiescence: false, nullMove: false };
export const CONFIGS = [
  { id: 'minimax', label: 'Plain minimax', config: OFF },
  { id: 'ab', label: 'Alpha-beta', config: { ...OFF, alphaBeta: true } },
  { id: 'ab+ord', label: '+ MVV-LVA ordering', config: { ...OFF, alphaBeta: true, ordering: true } },
  { id: 'ab+tt', label: '+ TT', config: { ...OFF, alphaBeta: true, tt: true } },
  { id: 'ab+ord+tt', label: '+ ordering + TT', config: { ...OFF, alphaBeta: true, ordering: true, tt: true } },
  { id: 'ab+ord+tt+null', label: '+ ordering + TT + null-move', config: { ...OFF, alphaBeta: true, ordering: true, tt: true, nullMove: true } },
  { id: 'ab+ord+tt+q', label: '+ ordering + TT + quiescence', config: { ...OFF, alphaBeta: true, ordering: true, tt: true, quiescence: true } },
  { id: 'all', label: 'Everything', config: { alphaBeta: true, ordering: true, tt: true, quiescence: true, nullMove: true } },
];

if (!isMainThread) {
  const { position, maxDepth, limitMs } = workerData;
  for (const { id, config } of CONFIGS) {
    for (let depth = 1; depth <= maxDepth; depth++) {
      const board = new Board();
      board.parseFen(position.fen);
      const r = new TeachingSearch(board, config, { timeLimitMs: limitMs }).run(depth);
      parentPort.postMessage({ position: position.name, config: id, depth, ...r });
      if (r.aborted) break;
    }
  }
  process.exit(0);
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const maxDepth = Number(arg('max-depth', 6));
  const limitMs = Number(arg('limit', 60)) * 1000;
  const workers = Number(arg('workers', availableParallelism()));
  const out = arg('out', 'bench/results/experiments.json');

  const queue = [...POSITIONS];
  const rows = [];
  const started = Date.now();
  const next = () => {
    const position = queue.shift();
    if (!position) return Promise.resolve();
    return new Promise((done, fail) => {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { position, maxDepth, limitMs } });
      w.on('message', (r) => {
        rows.push(r);
        console.error(`${r.position.padEnd(26)} ${r.config.padEnd(15)} d${r.depth}  ${String(r.nodes).padStart(10)} nodes ${String(r.timeMs).padStart(6)} ms  ${r.move} ${r.score}${r.aborted ? '  (stopped)' : ''}`);
      });
      w.on('error', fail);
      w.on('exit', () => done(next()));
    });
  };
  await Promise.all(Array.from({ length: workers }, next));

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ maxDepth, limitMs, positions: POSITIONS, configs: CONFIGS, rows }, null, 1));
  console.error(`done in ${Math.round((Date.now() - started) / 60000)} min → ${out}`);
}
