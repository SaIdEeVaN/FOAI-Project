// How the size of the (fixed) transposition table affects the game search.
//
//   node bench/tt-size.js
//
// Each position is searched to a fixed depth with tables from 2^8 to 2^22
// slots. A smaller table forgets more, so the same depth costs more nodes; the
// question is how small it can get before that shows.
import { Board } from '../src/engine/board.js';
import { SearchEngine } from '../src/engine/search.js';
import { TranspositionTable } from '../src/engine/transposition.js';

const POSITIONS = [
  { name: 'Start position', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', depth: 7 },
  { name: 'Kiwipete', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', depth: 6 },
  { name: 'Perft position 6', fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', depth: 6 },
  { name: 'Fine #70', fen: '8/k7/3p4/p2P1p2/P2P1P2/8/8/K7 w - - 0 1', depth: 12 },
];
const BITS = [8, 12, 16, 19, 22];

console.log('| Position | Depth | ' + BITS.map(b => `2^${b} slots`).join(' | ') + ' |');
console.log('|---|---:|' + BITS.map(() => '---:').join('|') + '|');
for (const p of POSITIONS) {
  const cells = BITS.map(bits => {
    const board = new Board();
    board.parseFen(p.fen);
    const tt = new TranspositionTable(bits);
    const engine = new SearchEngine(board, [board.positionKey()], { tt });
    const t = Date.now();
    const r = engine.getBestMove(120_000, null, { maxDepth: p.depth });
    const ms = Date.now() - t;
    const done = r.depth === p.depth && ms < 120_000;
    console.error(`${p.name} 2^${bits}: ${r.bestMove?.toUci()} d${r.depth} ${r.nodes} nodes ${ms} ms, ${(tt.hashfull() / 10).toFixed(0)}% full`);
    return `${done ? '' : '≥ '}${r.nodes.toLocaleString('en-US')} (${(ms / 1000).toFixed(1)} s, ${r.bestMove?.toUci()})`;
  });
  console.log(`| ${p.name} | ${p.depth} | ${cells.join(' | ')} |`);
}
