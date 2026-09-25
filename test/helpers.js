import { Board } from '../src/engine/board.js';
import { MoveGenerator } from '../src/engine/moveGen.js';

export function boardFrom(fen) {
  const board = new Board();
  if (fen) board.parseFen(fen);
  return board;
}

// Plays UCI moves on `board`, failing loudly on an illegal one.
export function play(board, ucis) {
  for (const uci of ucis) {
    const move = new MoveGenerator(board).generateLegalMoves().find(m => m.toUci() === uci);
    if (!move) throw new Error(`Illegal move ${uci} in ${board.toFen()}`);
    board.makeMove(move);
  }
  return board;
}

export function perft(board, depth) {
  if (depth === 0) return 1;
  const moves = new MoveGenerator(board).generateLegalMoves();
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    board.makeMove(move);
    nodes += perft(board, depth - 1);
    board.unmakeMove(move);
  }
  return nodes;
}

// The standard perft positions (chessprogramming.org/Perft_Results) with their
// published leaf counts from depth 1 upward.
export const PERFT_POSITIONS = {
  'start position': ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281, 4865609]],
  'Kiwipete (position 2)': ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
  'position 3': ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  'position 4': ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  'position 4 mirrored': ['r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1', [6, 264, 9467, 422333]],
  'position 5': ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
  'position 6': ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, 3894594]],
};
