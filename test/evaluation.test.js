import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Evaluation } from '../src/engine/evaluation.js';
import { boardFrom, PERFT_POSITIONS } from './helpers.js';

// Swap colours and flip the board top to bottom: the same position for the
// other side, so every term must come out negated.
function mirror(fen) {
  const [placement, side, castling, ep, ...rest] = fen.split(' ');
  const swap = (s) => [...s].map(c => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
  const flipped = placement.split('/').reverse().map(swap).join('/');
  const rights = castling === '-' ? '-' : [...swap(castling)].sort((a, b) => 'KQkq'.indexOf(a) - 'KQkq'.indexOf(b)).join('');
  const passant = ep === '-' ? '-' : ep[0] + (9 - Number(ep[1]));
  return [flipped, side === 'w' ? 'b' : 'w', rights, passant, ...rest].join(' ');
}

const TERMS = ['material', 'pieceSquare', 'pawnStructure', 'kingSafety', 'mobility', 'total'];

test('the start position is level', () => {
  assert.equal(new Evaluation().evaluate(boardFrom()), 0);
});

test('evaluation is colour-symmetric, term by term', () => {
  const ev = new Evaluation();
  for (const [name, [fen]] of Object.entries(PERFT_POSITIONS)) {
    const a = ev.breakdown(boardFrom(fen));
    const b = ev.breakdown(boardFrom(mirror(fen)));
    for (const t of TERMS) assert.equal(a[t] + b[t], 0, `${name}: ${t}`);
  }
});

test('the breakdown adds up to what evaluate() returns', () => {
  const ev = new Evaluation();
  for (const [fen] of Object.values(PERFT_POSITIONS)) {
    const b = ev.breakdown(boardFrom(fen));
    assert.equal(b.material + b.pieceSquare + b.pawnStructure + b.kingSafety + b.mobility, b.total);
    assert.equal(ev.evaluate(boardFrom(fen)), b.total);
  }
});

test('an extra queen is worth about 900', () => {
  const ev = new Evaluation();
  const up = ev.breakdown(boardFrom('4k3/8/8/8/8/8/8/3QK3 w - - 0 1'));
  assert.equal(up.material, 900);
});
