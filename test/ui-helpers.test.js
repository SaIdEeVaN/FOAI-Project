// The plain-JS helpers the interface leans on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatScore, isMate, mateIn, MATE_SCORE } from '../src/components/score.js';
import { premoveTargets } from '../src/engine/premove.js';
import { boardFrom } from './helpers.js';

test('scores format as pawns, and mates as M<n>', () => {
  assert.equal(formatScore(0), '0.00');
  assert.equal(formatScore(135, { sign: true }), '+1.35');
  assert.equal(formatScore(-40, { sign: true, decimals: 1 }), '−0.4');
  assert.equal(isMate(MATE_SCORE - 3), true);
  assert.equal(mateIn(MATE_SCORE - 3), 2);
  assert.equal(formatScore(MATE_SCORE - 1, { sign: true }), '+M1');
  assert.equal(formatScore(-(MATE_SCORE - 4), { sign: true }), '−M2');
  assert.equal(formatScore(MATE_SCORE), '#');
});

test('premove targets are geometry only, and skip squares your own pieces hold', () => {
  const { squares, castlingRights } = boardFrom();
  const names = (sq) => premoveTargets(squares, castlingRights, sq)
    .map(t => `${'abcdefgh'[t % 8]}${8 - Math.floor(t / 8)}`).sort();
  assert.deepEqual(names(52), ['d3', 'e3', 'e4', 'f3']); // e2 pawn: pushes and both captures
  assert.deepEqual(names(62), ['f3', 'h3']); // g1 knight: e2 holds a white pawn
  assert.deepEqual(names(60), []); // e1 king, boxed in by its own pieces
});
