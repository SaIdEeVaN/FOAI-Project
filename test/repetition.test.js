import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, hasThreefoldRepetition } from '../src/engine/board.js';
import { MoveGenerator } from '../src/engine/moveGen.js';
import { boardFrom, play } from './helpers.js';

function keysAfter(ucis) {
  const board = new Board();
  const keys = [board.positionKey()];
  for (const uci of ucis) { play(board, [uci]); keys.push(board.positionKey()); }
  return keys;
}

const SHUFFLE = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];

test('a knight shuffle repeats the start position the third time at ply 8', () => {
  const two = [...SHUFFLE, ...SHUFFLE];
  assert.equal(hasThreefoldRepetition(keysAfter(two.slice(0, 4))), false);
  assert.equal(hasThreefoldRepetition(keysAfter(two.slice(0, 7))), false);
  assert.equal(hasThreefoldRepetition(keysAfter(two)), true);
});

test('occurrences need not be consecutive', () => {
  const keys = keysAfter([...SHUFFLE, 'b1c3', 'b8c6', 'c3b1', 'c6b8', ...SHUFFLE]);
  assert.equal(hasThreefoldRepetition(keys), true);
});

test('side to move and castling rights are part of the position', () => {
  const a = boardFrom('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1').positionKey();
  assert.notEqual(a, boardFrom('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1').positionKey());
  assert.notEqual(a, boardFrom('r3k2r/8/8/8/8/8/8/R3K2R w Kkq - 0 1').positionKey());
});

test('en passant counts only when the capture is really possible', () => {
  const capturable = boardFrom('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const spent = boardFrom('4k3/8/8/3p4/8/8/4P3/4K3 w - d6 0 1');
  assert.notEqual(capturable.positionKey(), boardFrom('4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1').positionKey());
  assert.equal(spent.positionKey(), boardFrom('4k3/8/8/3p4/8/8/4P3/4K3 w - - 0 1').positionKey());
  // A pawn on the h-file must not "capture" across the board edge onto the a-file.
  const wrap = boardFrom('4k3/8/8/p6P/8/8/8/4K3 w - a6 0 1');
  assert.equal(wrap.positionKey(), boardFrom('4k3/8/8/p6P/8/8/8/4K3 w - - 0 1').positionKey());
});

test('make and unmake restore the key exactly', () => {
  const board = boardFrom('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const before = board.positionKey();
  for (const move of new MoveGenerator(board).generateLegalMoves()) {
    board.makeMove(move);
    board.unmakeMove(move);
    assert.equal(board.positionKey(), before, move.toUci());
  }
});
