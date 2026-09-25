// Forty short, mainstream opening lines. Matches start from these so that a
// deterministic engine does not play the same game over and over, and each
// opening is played once with each colour.
import { Board } from '../src/engine/board.js';
import { parseMove } from '../src/engine/san.js';

export const OPENINGS = [
  ['Ruy Lopez', 'e4 e5 Nf3 Nc6 Bb5 a6'],
  ['Italian', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  ['Two Knights', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3'],
  ['Scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4'],
  ['Petrov', 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4'],
  ['Philidor', 'e4 e5 Nf3 d6 d4 Nf6'],
  ['Vienna', 'e4 e5 Nc3 Nf6 f4'],
  ["King's Gambit", 'e4 e5 f4 exf4 Nf3 g5'],
  ["Bishop's Opening", 'e4 e5 Bc4 Nf6 d3 c6'],
  ['Sicilian Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'],
  ['Accelerated Dragon', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6'],
  ['Sicilian Taimanov', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6'],
  ['Closed Sicilian', 'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7'],
  ['Alapin', 'e4 c5 c3 Nf6 e5 Nd5'],
  ['Moscow', 'e4 c5 Nf3 d6 Bb5+ Bd7'],
  ['French Winawer', 'e4 e6 d4 d5 Nc3 Bb4'],
  ['French Advance', 'e4 e6 d4 d5 e5 c5 c3 Nc6'],
  ['Caro-Kann Advance', 'e4 c6 d4 d5 e5 Bf5'],
  ['Caro-Kann Classical', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'],
  ['Scandinavian', 'e4 d5 exd5 Qxd5 Nc3 Qa5'],
  ['Alekhine', 'e4 Nf6 e5 Nd5 d4 d6'],
  ['Pirc', 'e4 d6 d4 Nf6 Nc3 g6'],
  ['Modern', 'e4 g6 d4 Bg7 Nc3 d6'],
  ["Queen's Gambit Declined", 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7'],
  ["Queen's Gambit Accepted", 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6'],
  ['Slav', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4'],
  ['Tarrasch', 'd4 d5 c4 e6 Nc3 c5 cxd5 exd5'],
  ["King's Indian", 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6'],
  ['Nimzo-Indian', 'd4 Nf6 c4 e6 Nc3 Bb4'],
  ["Queen's Indian", 'd4 Nf6 c4 e6 Nf3 b6'],
  ['Grünfeld', 'd4 Nf6 c4 g6 Nc3 d5'],
  ['Benko', 'd4 Nf6 c4 c5 d5 b5'],
  ['Bogo-Indian', 'd4 e6 c4 Bb4+ Bd2 Qe7'],
  ['Dutch Leningrad', 'd4 f5 g3 Nf6 Bg2 g6'],
  ['London', 'd4 d5 Bf4 Nf6 e3 c5'],
  ['Torre', 'd4 Nf6 Nf3 e6 Bg5 c5'],
  ['English Four Knights', 'c4 e5 Nc3 Nf6 Nf3 Nc6'],
  ['Symmetrical English', 'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7'],
  ['Réti', 'Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4'],
  ['Larsen', 'b3 e5 Bb2 Nc6'],
];

// The UCI moves of an opening, checked for legality as they are read.
export function openingMoves(san) {
  const board = new Board();
  return san.split(' ').map(text => {
    const { move, error } = parseMove(board, text);
    if (error) throw new Error(`Opening "${san}": ${error}`);
    board.makeMove(move);
    return move.toUci();
  });
}
