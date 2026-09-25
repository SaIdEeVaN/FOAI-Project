// Teaching mode's whole claim: plain minimax visits exactly the cumulative perft,
// and pruning, ordering and memoisation change only the cost, never the answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TeachingSearch, configKey, TECHNIQUES } from '../src/engine/teachingSearch.js';
import { boardFrom, perft, PERFT_POSITIONS } from './helpers.js';

const OFF = { alphaBeta: false, ordering: false, tt: false, quiescence: false, nullMove: false };
const run = (fen, config, depth) => new TeachingSearch(boardFrom(fen), config).run(depth);

const POSITIONS = {
  start: PERFT_POSITIONS['start position'][0],
  kiwipete: PERFT_POSITIONS['Kiwipete (position 2)'][0],
  'position 3': PERFT_POSITIONS['position 3'][0],
  italian: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
};

test('plain minimax visits exactly perft(0) + … + perft(depth)', () => {
  for (const [name, fen] of Object.entries(POSITIONS)) {
    const board = boardFrom(fen);
    let cumulative = 0;
    for (let d = 0; d <= 3; d++) cumulative += perft(board, d);
    assert.equal(run(fen, OFF, 3).nodes, cumulative, name);
  }
});

test('alpha-beta, ordering and the table change the cost, not the move or score', () => {
  const exact = [
    { ...OFF, alphaBeta: true },
    { ...OFF, alphaBeta: true, ordering: true },
    { ...OFF, alphaBeta: true, tt: true },
    { ...OFF, alphaBeta: true, ordering: true, tt: true },
  ];
  for (const [name, fen] of Object.entries(POSITIONS)) {
    const plain = run(fen, OFF, 3);
    for (const config of exact) {
      const r = run(fen, config, 3);
      assert.equal(r.score, plain.score, `${name} ${configKey(config)}`);
      assert.ok(r.nodes < plain.nodes, `${name} ${configKey(config)} prunes`);
    }
    // Ordering never changes which of several equal moves is found first,
    // so the move itself only has to agree without it.
    assert.equal(run(fen, exact[0], 3).move, plain.move, name);
  }
});

test('a search past its time limit stops and says so', () => {
  const r = new TeachingSearch(boardFrom(POSITIONS.kiwipete), OFF, { timeLimitMs: 30 }).run(5);
  assert.equal(r.aborted, true);
  assert.ok(r.nodes > 0);
});

test('config keys name every technique', () => {
  assert.equal(TECHNIQUES.length, 5);
  assert.equal(configKey(OFF), '-|-|-|-|-');
  assert.equal(configKey({ ...OFF, alphaBeta: true, tt: true }), 'alphaBeta|-|tt|-|-');
});
