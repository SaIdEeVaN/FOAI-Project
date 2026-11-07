import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Evaluation } from '../src/engine/evaluation.js';
import { WEIGHTS } from '../src/engine/weights.js';
import { flatten, unflatten, N_PARAMS } from '../src/engine/evalLayout.js';
import { MoveGenerator } from '../src/engine/moveGen.js';
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
  // One queen is phase 4 of 24: mostly the endgame value.
  const { mg, eg } = WEIGHTS;
  assert.equal(up.material, Math.trunc((mg.pieceValue.Q * 4 + eg.pieceValue.Q * 20) / 24));
  assert.ok(up.material > 700 && up.material < 1300, String(up.material));
});

test('the game phase runs from 24 at the start to 0 with kings and pawns', () => {
  const ev = new Evaluation();
  assert.equal(ev.breakdown(boardFrom()).phase, 24);
  assert.equal(ev.breakdown(boardFrom('4k3/pppp4/8/8/8/8/4PPPP/4K3 w - - 0 1')).phase, 0);
  assert.equal(ev.breakdown(boardFrom('r3k3/8/8/8/8/8/8/4K2Q w - - 0 1')).phase, 6);
});

test('with the pieces off, a central king is better than one in the corner', () => {
  const ev = new Evaluation();
  // Same pawns; only the White king moves from h1 to e4.
  const corner = ev.evaluate(boardFrom('4k3/pp6/8/8/8/8/PP6/7K w - - 0 1'));
  const centre = ev.evaluate(boardFrom('4k3/pp6/8/8/4K3/8/PP6/8 w - - 0 1'));
  assert.ok(centre > corner, `centre ${centre} vs corner ${corner}`);
});

test('with the queens on, a castled king is better than one in the centre', () => {
  const ev = new Evaluation();
  const castled = ev.evaluate(boardFrom('r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 0 1'));
  const centre = ev.evaluate(boardFrom('r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NK1N2/PPPP1PPP/R1BQ1R2 w - - 0 1'));
  assert.ok(castled > centre, `castled ${castled} vs centre ${centre}`);
});

test('a passed pawn scores more than the same pawn blocked, and more the further it has gone', () => {
  const ev = new Evaluation();
  const pawns = (fen) => ev.breakdown(boardFrom(fen)).pawnStructure;
  // White's e-pawn against a Black pawn on d7 (not passed) or a7 (passed).
  const blocked = pawns('4k3/3p4/8/4P3/8/8/8/4K3 w - - 0 1');
  const passed = pawns('4k3/p7/8/4P3/8/8/8/4K3 w - - 0 1');
  const further = pawns('4k3/p7/4P3/8/8/8/8/4K3 w - - 0 1');
  assert.ok(passed > blocked, `passed ${passed} vs blocked ${blocked}`);
  assert.ok(further > passed, `on e6 ${further} vs on e5 ${passed}`);
});

// Deterministic playouts give positions of every kind for the next tests.
function randomPositions(count, seed = 1) {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 2 ** 32; };
  const fens = [];
  for (let game = 0; fens.length < count; game++) {
    const board = boardFrom();
    for (let ply = 0; ply < 160 && fens.length < count; ply++) {
      const moves = new MoveGenerator(board).generateLegalMoves();
      if (!moves.length) break;
      board.makeMove(moves[Math.floor(rand() * moves.length)]);
      if (ply % 7 === 3) fens.push(board.toFen());
    }
  }
  return fens;
}

// The tuner fits weights to features(); this is what makes that the same as
// fitting evaluate(). Each of the five terms is rounded on its own, so the
// linear form can differ from evaluate() by under one centipawn per term.
test('features() and the weights reproduce evaluate()', () => {
  const ev = new Evaluation();
  const mg = flatten(WEIGHTS.mg), eg = flatten(WEIGHTS.eg);
  const fens = [...Object.values(PERFT_POSITIONS).map(([fen]) => fen), ...randomPositions(400)];
  for (const fen of fens) {
    const board = boardFrom(fen);
    const { phase, index, value } = ev.features(board);
    let linear = 0;
    index.forEach((i, k) => { linear += value[k] * (mg[i] * phase + eg[i] * (24 - phase)) / 24; });
    const actual = ev.evaluate(board);
    assert.ok(Math.abs(linear - actual) < 5, `${fen}: linear ${linear.toFixed(2)} vs evaluate ${actual}`);
  }
});

test('evaluation is colour-symmetric on random positions too', () => {
  const ev = new Evaluation();
  for (const fen of randomPositions(300, 7)) {
    const a = ev.breakdown(boardFrom(fen));
    const b = ev.breakdown(boardFrom(mirror(fen)));
    for (const t of TERMS) assert.equal(a[t] + b[t], 0, `${fen}: ${t}`);
  }
});

test('flatten and unflatten are inverses', () => {
  for (const phase of ['mg', 'eg']) {
    const v = flatten(WEIGHTS[phase]);
    assert.equal(v.length, N_PARAMS);
    assert.deepEqual(flatten(unflatten(v)), v);
  }
});
