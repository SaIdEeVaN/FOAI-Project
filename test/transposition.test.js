import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TranspositionTable, TT_EXACT, TT_ALPHA, TT_BETA, encodeMove } from '../src/engine/transposition.js';
import { Move } from '../src/engine/move.js';
import { Board } from '../src/engine/board.js';
import { MoveGenerator } from '../src/engine/moveGen.js';
import { boardFrom, play } from './helpers.js';

const key = (hi, lo) => ({ hi, lo });
const e2e4 = new Move(52, 36, 'P');

test('the table is a fixed size and never grows', () => {
  const tt = new TranspositionTable(10);
  const arrays = [tt.keyHi, tt.keyLo, tt.scores, tt.moves, tt.depths, tt.bounds, tt.ages];
  for (let i = 0; i < 50_000; i++) tt.store(key(i * 7919, i), 1 + (i % 5), i, TT_EXACT, e2e4);
  assert.equal(tt.size, 1024);
  for (const a of arrays) assert.equal(a.length, 1024);
  assert.ok(tt.used <= 1024);
  assert.equal(tt.hashfull(), 1000);
  tt.clear();
  assert.equal(tt.hashfull(), 0);
  assert.deepEqual(tt.lookup(key(7919, 1), 0, -1e9, 1e9), [null, 0]);
});

test('lookup honours depth and bound type', () => {
  const tt = new TranspositionTable(8);
  const k = key(1, 2);
  tt.store(k, 4, 50, TT_EXACT, e2e4);
  assert.deepEqual(tt.lookup(k, 4, -100, 100), [50, encodeMove(e2e4)]);
  assert.deepEqual(tt.lookup(k, 5, -100, 100), [null, encodeMove(e2e4)], 'too shallow: move only');

  tt.store(k, 4, 50, TT_ALPHA, e2e4); // At most 50
  assert.deepEqual(tt.lookup(k, 4, 60, 100)[0], 60);
  assert.equal(tt.lookup(k, 4, 40, 100)[0], null);

  tt.store(k, 4, 50, TT_BETA, e2e4); // At least 50
  assert.equal(tt.lookup(k, 4, -100, 40)[0], 40);
  assert.equal(tt.lookup(k, 4, -100, 60)[0], null);
});

test('a key is checked in full, not just by its slot', () => {
  const tt = new TranspositionTable(4);
  tt.store(key(1, 3), 2, 10, TT_EXACT, e2e4);
  assert.deepEqual(tt.lookup(key(2, 3), 0, -1e9, 1e9), [null, 0], 'same slot, different position');
  assert.deepEqual(tt.lookup(key(1, 3 + 16), 0, -1e9, 1e9), [null, 0]);
});

test('replacement keeps the deeper entry within a search, and gives way to a new search', () => {
  const tt = new TranspositionTable(4);
  const deep = key(100, 5), shallow = key(200, 5); // Same slot
  tt.store(deep, 6, 1, TT_EXACT, e2e4);
  tt.store(shallow, 2, 2, TT_EXACT, e2e4);
  assert.equal(tt.lookup(deep, 6, -1e9, 1e9)[0], 1, 'deeper entry survived');
  assert.equal(tt.lookup(shallow, 2, -1e9, 1e9)[0], null);

  tt.store(deep, 3, 7, TT_EXACT, null); // The same position is always refreshed
  assert.deepEqual(tt.lookup(deep, 3, -1e9, 1e9), [7, encodeMove(e2e4)], 'best move kept when none is given');

  tt.store(deep, 9, 1, TT_EXACT, e2e4);
  tt.newSearch();
  tt.store(shallow, 1, 2, TT_EXACT, e2e4);
  assert.equal(tt.lookup(shallow, 1, -1e9, 1e9)[0], 2, 'stale entry replaced');
});

test('mate scores are stored relative to the node and read back per ply', () => {
  const tt = new TranspositionTable(4);
  const k = key(9, 9);
  // Found at ply 3: the side to move there mates 5 plies from the root.
  tt.store(k, 4, 20000 - 5, TT_EXACT, e2e4, 3);
  // Reached again at ply 1, the same mate is 2 plies closer to the root.
  assert.equal(tt.lookup(k, 4, -1e9, 1e9, 1)[0], 20000 - 3);
  tt.store(k, 4, -(20000 - 6), TT_EXACT, e2e4, 4);
  assert.equal(tt.lookup(k, 4, -1e9, 1e9, 2)[0], -(20000 - 4));
  tt.store(k, 4, 250, TT_EXACT, e2e4, 4);
  assert.equal(tt.lookup(k, 4, -1e9, 1e9, 2)[0], 250, 'ordinary scores are untouched');
});

test('Zobrist keys: transpositions match, anything that matters differs', () => {
  const tt = new TranspositionTable(4);
  const hash = (b) => tt.computeHash(b);
  const a = play(new Board(), ['g1f3', 'g8f6', 'b1c3']);
  const b = play(new Board(), ['b1c3', 'g8f6', 'g1f3']);
  assert.deepEqual(hash(a), hash(b), 'same position by another move order');

  const base = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  const variants = [
    'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1',
    'r3k2r/8/8/8/8/8/8/R3K2R w Qkq - 0 1',
    'r3k2r/8/8/8/8/8/8/R3K2R w KQk - 0 1',
    'r3k2r/8/8/8/8/8/8/R3K1R1 w Qkq - 0 1',
  ];
  const seen = new Set([JSON.stringify(hash(boardFrom(base)))]);
  for (const fen of variants) seen.add(JSON.stringify(hash(boardFrom(fen))));
  assert.equal(seen.size, variants.length + 1);

  const withEp = boardFrom('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const withoutEp = boardFrom('4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1');
  assert.notDeepEqual(hash(withEp), hash(withoutEp));
});

test('keys spread over every slot, however small the table', () => {
  // The table picks a slot by the low bits of the key. Keys drawn from a plain
  // linear congruential generator have almost periodic low bits and once left
  // half of a 256-slot table unused; every slot must be reachable.
  const tt = new TranspositionTable(8);
  const slots = new Set();
  const walk = (board, depth) => {
    slots.add(tt.computeHash(board).lo & tt.mask);
    if (depth === 0) return;
    for (const move of new MoveGenerator(board).generateLegalMoves()) {
      board.makeMove(move);
      walk(board, depth - 1);
      board.unmakeMove(move);
    }
  };
  walk(new Board(), 3); // 9,322 positions
  assert.equal(slots.size, 256);
});
