// Perft counts every leaf of the legal-move tree to a fixed depth. A single
// wrong move anywhere — a missed en passant, castling through check, a pinned
// piece allowed to move — changes the count, so matching the published numbers
// is the strongest correctness check a move generator has.
//
// The default run stops below a million leaves per position so `npm test` stays
// quick. PERFT_DEEP=1 runs every published depth (about 15 s).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardFrom, perft, PERFT_POSITIONS } from './helpers.js';

const deep = process.env.PERFT_DEEP === '1';

for (const [name, [fen, counts]] of Object.entries(PERFT_POSITIONS)) {
  test(`perft: ${name}`, () => {
    const board = boardFrom(fen);
    counts.forEach((expected, i) => {
      if (!deep && expected > 1_000_000) return;
      assert.equal(perft(board, i + 1), expected, `depth ${i + 1}`);
    });
    assert.equal(board.toFen(), fen, 'make/unmake leaves the position unchanged');
  });
}
