import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/engine/board.js';
import { MoveGenerator } from '../src/engine/moveGen.js';
import { toSan, parseMove, lineToSan } from '../src/engine/san.js';
import { boardFrom } from './helpers.js';

// Morphy v Duke of Brunswick and Count Isouard, Paris 1858: captures, a checking
// sacrifice, knight disambiguation (Nbd7), queen-side castling and mate.
const OPERA = ('e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 ' +
  'Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#').split(' ');

test('the Opera Game reads and writes back identically', () => {
  const board = new Board();
  const ucis = [];
  for (const san of OPERA) {
    const { move, error } = parseMove(board, san);
    assert.equal(error, undefined, san);
    assert.equal(toSan(board, move), san);
    ucis.push(move.toUci());
    board.makeMove(move);
  }
  assert.deepEqual(lineToSan(new Board(), ucis), OPERA);
});

const sanOf = (fen, uci) => {
  const board = boardFrom(fen);
  const move = new MoveGenerator(board).generateLegalMoves().find(m => m.toUci() === uci);
  assert.ok(move, `${uci} is legal`);
  return toSan(board, move);
};

test('pawn moves: captures, en passant and every promotion', () => {
  assert.equal(sanOf('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', 'e5d6'), 'exd6');
  assert.equal(sanOf('3r4/4P2k/8/8/8/8/8/4K3 w - - 0 1', 'e7e8q'), 'e8=Q');
  assert.equal(sanOf('3r4/4P2k/8/8/8/8/8/4K3 w - - 0 1', 'e7d8n'), 'exd8=N');
  assert.equal(sanOf('3r4/4P2k/8/8/8/8/8/4K3 w - - 0 1', 'e7e8b'), 'e8=B');
  assert.equal(sanOf('7k/4P3/8/8/8/8/8/4K3 w - - 0 1', 'e7e8r'), 'e8=R+');
  assert.equal(sanOf('4k3/8/8/8/8/8/1p6/4K3 b - - 0 1', 'b2b1q'), 'b1=Q+');
});

test('disambiguation by file, by rank, and by both', () => {
  // Rooks on a1 and h1 can both reach d1: the file tells them apart.
  assert.equal(sanOf('4k3/8/8/8/8/8/4K3/R6R w - - 0 1', 'a1d1'), 'Rad1');
  assert.equal(sanOf('4k3/8/8/8/8/8/4K3/R6R w - - 0 1', 'h1d1'), 'Rhd1');
  // With the king between them only one rook can get there, so no letter.
  assert.equal(sanOf('4k3/8/8/8/8/8/8/R3K2R w - - 0 1', 'a1d1'), 'Rd1');
  // Rooks on a1 and a5, both on the a-file, can reach a3: the rank does.
  assert.equal(sanOf('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1', 'a1a3'), 'R1a3');
  // Queens on e1, h1 and h4 can all reach e4. The h1 queen shares a file with
  // one and a rank with the other, so only its full square will do.
  assert.equal(sanOf('2K5/8/k7/8/7Q/8/8/4Q2Q w - - 0 1', 'h1e4'), 'Qh1e4');
  assert.equal(sanOf('2K5/8/k7/8/7Q/8/8/4Q2Q w - - 0 1', 'h4e4'), 'Q4e4');
  assert.equal(sanOf('2K5/8/k7/8/7Q/8/8/4Q2Q w - - 0 1', 'e1e4'), 'Qee4');
  // A knight that is the only one able to go there needs nothing.
  assert.equal(sanOf('4k3/8/8/8/8/8/8/1N2K1N1 w - - 0 1', 'g1f3'), 'Nf3');
});

test('castling, check and mate marks', () => {
  assert.equal(sanOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1'), 'O-O');
  assert.equal(sanOf('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'e8c8'), 'O-O-O');
  assert.equal(sanOf('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8'), 'Ra8+');
  assert.equal(sanOf('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8'), 'Ra8#');
});

test('parseMove is forgiving about how a move is typed', () => {
  const board = boardFrom('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const uci = (text) => parseMove(board, text).move?.toUci();
  assert.equal(uci('O-O'), 'e1g1');
  assert.equal(uci('0-0-0'), 'e1c1');
  assert.equal(uci('Nxd7'), 'e5d7');
  assert.equal(uci('Nd7'), 'e5d7', 'x may be left out');
  assert.equal(uci('Qxf6+!?'), 'f3f6', 'check marks and annotations are ignored');
  assert.equal(uci('Ned7'), 'e5d7', 'needless disambiguation is fine');
  assert.equal(uci('e5d7'), 'e5d7', 'UCI works too');
  assert.equal(uci(' dxe6 '), 'd5e6');
});

test('parseMove says why a move cannot be played', () => {
  const board = boardFrom('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.match(parseMove(board, '').error, /Type a move/);
  assert.match(parseMove(board, 'Ke3').error, /not legal/);
  assert.match(parseMove(board, 'hello').error, /not a move in SAN/);
  assert.match(parseMove(boardFrom('4k3/8/8/8/8/8/4K3/R6R w - - 0 1'), 'Rd1').error, /ambiguous: Rad1 or Rhd1/);
  const promo = boardFrom('3r4/4P2k/8/8/8/8/8/4K3 w - - 0 1');
  assert.match(parseMove(promo, 'e8').error, /promote to/);
  assert.equal(parseMove(promo, 'e8N').move.toUci(), 'e7e8n');
  assert.equal(parseMove(promo, 'exd8=R').move.toUci(), 'e7d8r');
  assert.equal(parseMove(promo, 'e7e8').move.toUci(), 'e7e8q', 'UCI without a piece promotes to a queen');
});
