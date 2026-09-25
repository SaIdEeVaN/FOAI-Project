import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SearchEngine, MATE } from '../src/engine/search.js';
import { TranspositionTable } from '../src/engine/transposition.js';
import { Board } from '../src/engine/board.js';
import { boardFrom, play } from './helpers.js';

// Fixed-depth searches keep these deterministic; the time limit is only a backstop.
function best(fen, { depth = 4, history, ...options } = {}) {
  const board = boardFrom(fen);
  const engine = new SearchEngine(board, history ?? [board.positionKey()], options);
  const result = engine.getBestMove(60_000, null, { maxDepth: depth });
  assert.equal(board.toFen(), boardFrom(fen).toFen(), 'the search leaves the board as it found it');
  return { move: result.bestMove?.toUci(), score: result.score, depth: result.depth };
}

for (const nullMove of [true, false]) {
  const label = nullMove ? 'with null-move' : 'without null-move';

  test(`mate in one (${label})`, () => {
    const r = best('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { nullMove });
    assert.equal(r.move, 'a1a8');
    assert.equal(r.score, MATE - 1);
  });

  test(`mate in two, the Opera Game finish (${label})`, () => {
    // 16.Qb8+ Nxb8 17.Rd8#
    const r = best('4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16', { nullMove });
    assert.equal(r.move, 'b3b8');
    assert.equal(r.score, MATE - 3);
  });

  test(`sees being mated and scores it (${label})`, () => {
    // Black to move cannot stop Ra8#... except by making luft.
    const r = best('6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1', { nullMove, depth: 3 });
    assert.ok(['f7f6', 'g7g6', 'h7h6', 'f7f5', 'g7g5', 'h7h5', 'g8f8'].includes(r.move), r.move);
    assert.ok(r.score > -MATE + 100, 'escapes, so not scored as mate');
  });

  test(`wins the hanging queen (${label})`, () => {
    const r = best('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', { nullMove, depth: 3 });
    assert.equal(r.move, 'd1d5');
  });
}

// Win at Chess #1: 1.Qg6! gxf6 2.Qh7#. After 1.Qg6 Black's null move must not
// hide the threat Qh7#, which a null search straight into quiescence cannot see.
const WAC1 = '2rr3k/pp3pp1/1nnqbN1p/3pN3/2pP4/2P3Q1/PPB4P/R4RK1 w - - 0 1';

test('null-move still finds the mate in two on WAC #1, at the same depth as without it', () => {
  for (const nullMove of [true, false]) {
    const r = best(WAC1, { depth: 4, nullMove });
    assert.equal(r.move, 'g3g6');
    assert.equal(r.score, MATE - 3);
  }
});

test('a null search that drops straight into quiescence misses it', () => {
  const r = best(WAC1, { depth: 4, nullMinDepth: 3 });
  assert.notEqual(r.move, 'g3g6');
});

// Knight shuffle: after 1.Nf3 Nf6 2.Ng1 Black can play 2...Ng8, back to the start
// position, which the game has already stood in. The search scores that as a
// draw; contempt decides whether a draw is welcome.
function shuffle(contempt) {
  const board = new Board();
  const history = [board.positionKey()];
  for (const uci of ['g1f3', 'g8f6', 'f3g1']) { play(board, [uci]); history.push(board.positionKey()); }
  const engine = new SearchEngine(board, history, { contempt });
  const { bestMove, score } = engine.getBestMove(60_000, null, { maxDepth: 3 });
  return { move: bestMove.toUci(), score };
}

test('negative contempt: the engine heads for the repetition', () => {
  const r = shuffle(-300);
  assert.equal(r.move, 'f6g8');
  assert.equal(r.score, 300);
});

test('positive contempt: the engine steers clear of it', () => {
  const r = shuffle(300);
  assert.notEqual(r.move, 'f6g8');
  assert.ok(r.score > -300);
});

// A lone queen cannot mate without her king's help, so there is no mate in one
// here; but 1.Qb6 or 1.Qc7 stalemates the black king in the corner. At depth 2
// the choice is purely a draw against a queen's worth of material.
const STALEMATE_TRAP = 'k7/8/8/8/3Q4/8/8/7K w - - 0 1';

test('stalemate is a draw, valued with contempt', () => {
  const loves = best(STALEMATE_TRAP, { depth: 2, contempt: -2000 });
  assert.ok(['d4b6', 'd4c7'].includes(loves.move), loves.move);
  assert.equal(loves.score, 2000);
  const avoids = best(STALEMATE_TRAP, { depth: 2, contempt: 0 });
  assert.ok(!['d4b6', 'd4c7'].includes(avoids.move), avoids.move);
  assert.ok(avoids.score > 800);
});

test('a reused table stays bounded across many searches', () => {
  const tt = new TranspositionTable(12);
  const board = new Board();
  for (const uci of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6']) {
    new SearchEngine(board, [board.positionKey()], { tt }).getBestMove(60_000, null, { maxDepth: 3 });
    play(board, [uci]);
  }
  assert.equal(tt.scores.length, 4096);
  assert.ok(tt.used <= 4096);
});
