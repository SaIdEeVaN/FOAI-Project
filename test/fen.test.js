import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, START_FEN } from '../src/engine/board.js';
import { validateFen, normalizeFen } from '../src/engine/fen.js';
import { boardFrom, play, PERFT_POSITIONS } from './helpers.js';

test('toFen reproduces every perft position exactly', () => {
  for (const [fen] of Object.values(PERFT_POSITIONS)) assert.equal(boardFrom(fen).toFen(), fen);
  assert.equal(new Board().toFen(), START_FEN);
});

test('toFen tracks moves, castling rights, en passant and the counters', () => {
  const board = play(new Board(), ['e2e4', 'c7c5', 'g1f3']);
  assert.equal(board.toFen(), 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
  play(board, ['d7d5', 'e4d5', 'd8d5', 'h1g1']);
  assert.equal(board.toFen(), 'rnb1kbnr/pp2pppp/8/2pq4/8/5N2/PPPP1PPP/RNBQKBR1 b Qkq - 1 4');
  play(new Board(), []);
  assert.equal(play(new Board(), ['e2e4']).toFen(), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
});

test('validateFen accepts real positions, with or without move counters', () => {
  for (const [fen] of Object.values(PERFT_POSITIONS)) assert.equal(validateFen(fen), null, fen);
  assert.equal(validateFen('2rr3k/pp3pp1/1nnqbN1p/3pN3/2pP4/2P3Q1/PPB4P/R4RK1 w - -'), null);
  assert.equal(validateFen('  8/8/8/8/8/k7/8/K7 b  '), null);
  assert.equal(normalizeFen('8/8/8/8/8/k7/8/K7 b'), '8/8/8/8/8/k7/8/K7 b - - 0 1');
});

test('validateFen explains what is wrong', () => {
  const cases = [
    ['', /placement and the side to move/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1', /7 ranks/],
    ['rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', /rank 6/],
    ['rnbqkbnr/ppppxppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', /"x" is not a piece/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1', /side to move/],
    ['8/8/8/8/8/8/k7/K7 b - - 0 1', /in check but it is not their move/],
    ['rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1', /Black must have exactly one king/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKKBNR w - - 0 1', /White must have exactly one king \(found 2\)/],
    ['Pnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w - - 0 1', /first or eighth rank/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w KQkq - 0 1', /king-side castling \("K"\)/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KKq - 0 1', /Castling rights must be/],
    ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e6 0 1', /rank 3/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - x 1', /half-move clock/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 0', /move number/],
    ['K7/8/8/8/8/8/8/k6R w - - 0 1', /Black is in check but it is not their move/],
  ];
  for (const [fen, message] of cases) assert.match(validateFen(fen) ?? 'accepted', message, fen);
});
