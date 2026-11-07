// Texel tuning: fits every evaluation weight to game results.
//
//   node bench/tune.js --data bench/data/selfplay.txt [--from hand|current] [--epochs 3000]
//                      [--lr 1] [--write] [--report bench/results/tuning.json]
//
// Each position i from the self-play games (bench/datagen.js) carries the result
// R_i of its game, from White's side: 1, ½ or 0. The evaluation q_i is linear in
// the weights, q_i = Σ_j φ_ij · (mg_j·phase_i + eg_j·(24 − phase_i)) / 24 with
// φ the counts from Evaluation.features(), and the tuner minimises
//
//   E = 1/N Σ_i (R_i − σ(q_i))²,    σ(q) = 1 / (1 + 10^(−K·q/400))
//
// the mean squared error between the result and the win probability the
// evaluation implies. K is fitted first, to the starting weights, and then held
// fixed, which pins the scale: a pawn stays worth about a hundred.
//
// With φ fixed per position, this is logistic regression (with a squared-error
// loss, as Texel tuning has it). The positions are turned into features once;
// each epoch is then a pass of multiply-adds over typed arrays, and the
// weights take a full-batch Adam step.
//
// The data are a few thousand games, and every position of a game shares its
// one result, so there is far less information here than the position count
// suggests. Three things keep the fit honest:
//   - an L2 penalty (--l2) pulling every weight towards its starting value: the
//     hand-set evaluation acts as a prior, and a weight moves only as far as
//     the games give it reason to;
//   - piece-square tables kept symmetric left to right (unless --asymmetric),
//     which halves their parameters;
//   - whole games held out: every tenth game for validation, which picks the
//     epoch to stop at and, across runs, the L2 strength; and another tenth as
//     a test set that no choice ever looks at, for the error that is reported.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Board } from '../src/engine/board.js';
import { Evaluation } from '../src/engine/evaluation.js';
import { N_PARAMS, FROZEN, OFFSET, PIECE_TYPES, pstIndex, flatten, unflatten, paramName, PHASE_MAX } from '../src/engine/evalLayout.js';
import { WEIGHTS } from '../src/engine/weights.js';
import { HAND_WEIGHTS, writeWeights } from './weights-file.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const dataFiles = arg('data', 'bench/data/selfplay.txt').split(',');
const from = arg('from', 'hand');
const epochs = Number(arg('epochs', 3000));
const lr = Number(arg('lr', 0.5));
const l2 = Number(arg('l2', 0));
const symmetric = !process.argv.includes('--asymmetric');
// adam: every weight moves at about the same rate, however rarely its pattern
// occurs. gd: gradient descent with momentum, where a weight moves in
// proportion to the evidence for it, so a piece-square entry seen in 0.1% of
// positions moves a thousand times slower than the pawn's value.
const optimizer = arg('optimizer', 'adam');
// --only pieceValue,passed,…: fit just these parameter groups and hold the rest.
const only = arg('only', null)?.split(',');
const write = process.argv.includes('--write');
const reportPath = arg('report', null);

// ── Load and featurise ─────────────────────────────────────────────────────
// Games are held out whole. Splitting by position instead would put near
// copies of the same position, with the same result, on both sides of the
// split, and the held-out error would flatter the fit.
const t0 = Date.now();
const all = dataFiles.flatMap(f => readFileSync(f, 'utf8').split('\n'))
  .map(l => l.split(';')).filter(([fen, r, g]) => fen && g !== undefined && (r === '1' || r === '0' || r === '0.5'));
const split = ([, , game]) => (Number(game) % 10 === 9 ? 'validation' : Number(game) % 10 === 8 ? 'test' : 'train');
const lines = ['train', 'validation', 'test'].flatMap(part => all.filter(l => split(l) === part));
const games = new Set(all.map(l => l[2])).size;

const N = lines.length;
const ev = new Evaluation();
const board = new Board();
const start = new Int32Array(N + 1);
const mgShare = new Float64Array(N), egShare = new Float64Array(N), result = new Float64Array(N);
let idxList = [], valList = [];
for (let i = 0; i < N; i++) {
  board.parseFen(lines[i][0]);
  const { phase, index, value } = ev.features(board);
  mgShare[i] = phase / PHASE_MAX;
  egShare[i] = 1 - phase / PHASE_MAX;
  result[i] = Number(lines[i][1]);
  start[i] = idxList.length;
  for (let k = 0; k < index.length; k++) { idxList.push(index[k]); valList.push(value[k]); }
}
start[N] = idxList.length;
const idx = Int16Array.from(idxList), val = Int8Array.from(valList);
idxList = valList = null;
const nTrain = lines.filter(l => split(l) === 'train').length;
const nVal = lines.filter(l => split(l) === 'validation').length;
const vEnd = nTrain + nVal; // Validation is [nTrain, vEnd), test is [vEnd, N)
const results = { white: 0, draw: 0, black: 0 };
for (let i = 0; i < N; i++) results[result[i] === 1 ? 'white' : result[i] === 0 ? 'black' : 'draw']++;
console.error(`${N} positions from ${games} games (${nTrain} train, ${nVal} validation, ${N - vEnd} test; `
  + `whole games held out), ${(idx.length / N).toFixed(1)} features each, `
  + `featurised in ${((Date.now() - t0) / 1000).toFixed(1)} s. Results: White ${results.white}, draws ${results.draw}, Black ${results.black}`);

// ── Model ────────────────────────────────────────────────────────────────────
const P = N_PARAMS;
const startWeights = from === 'current' ? WEIGHTS : HAND_WEIGHTS;
const theta0 = Float64Array.from([...flatten(startWeights.mg), ...flatten(startWeights.eg)]);
const frozen = new Uint8Array(2 * P);
for (const j of FROZEN) { frozen[j] = 1; frozen[P + j] = 1; }
if (only) {
  for (let j = 0; j < P; j++) {
    if (!only.includes(paramName(j).split(/[.[]/)[0])) { frozen[j] = 1; frozen[P + j] = 1; }
  }
}

// Pairs of piece-square entries mirrored left to right (a-file with h-file…),
// tied together when the tables are kept symmetric.
const mirrorPairs = [];
for (const half of [0, P]) {
  for (const t of PIECE_TYPES) {
    for (let sq = 0; sq < 64; sq++) if ((sq & 7) < 4) mirrorPairs.push([half + pstIndex(t, sq), half + pstIndex(t, sq ^ 7)]);
  }
}
if (symmetric) for (const [a, b] of mirrorPairs) theta0[a] = theta0[b] = (theta0[a] + theta0[b]) / 2;
const theta = Float64Array.from(theta0);

function evalOne(i, th) {
  let mg = 0, eg = 0;
  for (let k = start[i], end = start[i + 1]; k < end; k++) {
    const j = idx[k], v = val[k];
    mg += v * th[j];
    eg += v * th[P + j];
  }
  return mg * mgShare[i] + eg * egShare[i];
}

const sigmoid = (q, K) => 1 / (1 + Math.pow(10, -K * q / 400));

function loss(th, K, from, to) {
  let e = 0;
  for (let i = from; i < to; i++) { const d = result[i] - sigmoid(evalOne(i, th), K); e += d * d; }
  return e / (to - from);
}

// K: the scale at which the starting evaluation best predicts results.
function fitK(th) {
  let lo = 0.1, hi = 4;
  for (let it = 0; it < 60; it++) {
    const a = lo + (hi - lo) * 0.382, b = lo + (hi - lo) * 0.618;
    if (loss(th, a, 0, nTrain) < loss(th, b, 0, nTrain)) hi = b; else lo = a;
  }
  return (lo + hi) / 2;
}

const K = fitK(theta0);
const c = K * Math.LN10 / 400;
const errors = (th) => ({ train: loss(th, K, 0, nTrain), validation: loss(th, K, nTrain, vEnd), test: loss(th, K, vEnd, N) });
const before = errors(theta0);
console.error(`K = ${K.toFixed(4)}; starting error: train ${before.train.toFixed(6)}, validation ${before.validation.toFixed(6)}, test ${before.test.toFixed(6)}`);

// ── Full-batch Adam ──────────────────────────────────────────────────────────
const grad = new Float64Array(2 * P), m1 = new Float64Array(2 * P), m2 = new Float64Array(2 * P);
const B1 = 0.9, B2 = 0.999, EPS = 1e-8;
let best = { validation: before.validation, epoch: 0, theta: Float64Array.from(theta) };
const curve = [];
const tTrain = Date.now();
for (let epoch = 1; epoch <= epochs; epoch++) {
  grad.fill(0);
  let e = 0;
  for (let i = 0; i < nTrain; i++) {
    const sg = sigmoid(evalOne(i, theta), K);
    const d = sg - result[i];
    e += d * d;
    // ∂E/∂q_i, up to the 1/N applied below.
    const g = 2 * d * sg * (1 - sg) * c;
    const gm = g * mgShare[i], ge = g * egShare[i];
    for (let k = start[i], end = start[i + 1]; k < end; k++) {
      const j = idx[k], v = val[k];
      grad[j] += gm * v;
      grad[P + j] += ge * v;
    }
  }
  if (symmetric) for (const [a, b] of mirrorPairs) grad[a] = grad[b] = grad[a] + grad[b];
  const lr_t = lr * Math.sqrt(1 - B2 ** epoch) / (1 - B1 ** epoch);
  for (let j = 0; j < 2 * P; j++) {
    if (frozen[j]) continue;
    const gj = grad[j] / nTrain + l2 * (theta[j] - theta0[j]);
    if (optimizer === 'gd') {
      m1[j] = 0.9 * m1[j] + gj; // Momentum
      theta[j] -= lr * m1[j];
    } else {
      m1[j] = B1 * m1[j] + (1 - B1) * gj;
      m2[j] = B2 * m2[j] + (1 - B2) * gj * gj;
      theta[j] -= lr_t * m1[j] / (Math.sqrt(m2[j]) + EPS);
    }
  }
  if (epoch % 25 === 0 || epoch === epochs) {
    const train = e / nTrain, validation = loss(theta, K, nTrain, vEnd);
    curve.push({ epoch, train, validation });
    if (validation < best.validation) best = { validation, epoch, theta: Float64Array.from(theta) };
    if (epoch % 250 === 0 || epoch === epochs) {
      console.error(`epoch ${String(epoch).padStart(5)}  train ${train.toFixed(6)}  validation ${validation.toFixed(6)}  `
        + `${((Date.now() - tTrain) / epoch).toFixed(0)} ms/epoch`);
    }
  }
}

// ── Tidy up: piece-square averages into the piece values, then integers ─────
// A piece's value and its table enter the evaluation only as a sum, so the
// fit cannot tell them apart. Moving each table's average into the value
// changes no evaluation and leaves the piece values meaning what they say.
// Pawns are averaged over the ranks they can stand on; the king's average
// cancels between the two sides, so it is simply dropped.
function tidyUp(th) {
  const out = Float64Array.from(th);
  for (const half of [0, P]) {
    [...PIECE_TYPES].forEach((t, ti) => {
      const squares = t === 'P' ? Array.from({ length: 48 }, (_, i) => i + 8) : Array.from({ length: 64 }, (_, i) => i);
      const mean = squares.reduce((a, sq) => a + out[half + pstIndex(t, sq)], 0) / squares.length;
      for (const sq of squares) out[half + pstIndex(t, sq)] -= mean;
      if (t !== 'K') out[half + OFFSET.pieceValue + ti] += mean;
    });
  }
  return out;
}
const rounded = Float64Array.from(tidyUp(best.theta), Math.round);
const startTidy = Float64Array.from(tidyUp(theta0), Math.round);
const after = errors(rounded);
console.error(`Best validation error at epoch ${best.epoch}; rounded weights: train ${after.train.toFixed(6)}, `
  + `validation ${after.validation.toFixed(6)}, test ${after.test.toFixed(6)} (from ${before.test.toFixed(6)})`);

const tuned = { mg: unflatten(Array.from(rounded.slice(0, P))), eg: unflatten(Array.from(rounded.slice(P))) };
const fmtV = (w) => [...'PNBRQ'].map(t => `${t} ${w.pieceValue[t]}`).join(', ');
console.log(`Piece values, middlegame: ${fmtV(tuned.mg)}`);
console.log(`Piece values, endgame:    ${fmtV(tuned.eg)}`);
for (const k of ['doubled', 'isolated', 'bishopPair', 'rookOpen', 'rookSemiOpen', 'kingFileOpen', 'kingFileBare', 'kingShield']) {
  console.log(`${k.padEnd(14)} mg ${String(tuned.mg[k]).padStart(5)}  eg ${String(tuned.eg[k]).padStart(5)}`);
}
console.log(`passed         mg [${tuned.mg.passed.join(', ')}]  eg [${tuned.eg.passed.join(', ')}]`);
console.log(`mobility       mg N ${tuned.mg.mobility.N} B ${tuned.mg.mobility.B} R ${tuned.mg.mobility.R}  eg N ${tuned.eg.mobility.N} B ${tuned.eg.mobility.B} R ${tuned.eg.mobility.R}`);

// The parameters that moved most, for a feel of what the data said.
const moved = Array.from({ length: 2 * P }, (_, j) => j).filter(j => !frozen[j])
  .map(j => ({ name: `${j < P ? 'mg' : 'eg'} ${paramName(j % P)}`, from: startTidy[j], to: rounded[j] }))
  .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
console.log('Largest changes (after moving table averages into piece values):');
for (const m of moved.slice(0, 12)) console.log(`  ${m.name.padEnd(22)} ${String(Math.round(m.from)).padStart(5)} → ${String(m.to).padStart(5)}`);

if (reportPath) {
  writeFileSync(reportPath, JSON.stringify({
    data: dataFiles, games, positions: N, train: nTrain, validation: nVal, test: N - vEnd, results,
    featuresPerPosition: idx.length / N, from, optimizer, epochs, lr, l2, symmetric, only, K,
    before, after, bestEpoch: best.epoch, curve,
    start: { mg: unflatten(Array.from(startTidy.slice(0, P))), eg: unflatten(Array.from(startTidy.slice(P))) },
    weights: tuned,
  }, null, 1));
}
if (write) {
  const path = fileURLToPath(new URL('../src/engine/weights.js', import.meta.url));
  writeWeights(path, tuned, [
    `Fitted by bench/tune.js (Texel tuning) to ${N.toLocaleString('en-US')} positions from ${games.toLocaleString('en-US')} of the engine's`,
    `self-play games (bench/datagen.js), starting from the ${from === 'hand' ? 'hand-set' : 'previous'} values. K = ${K.toFixed(4)}; mean squared`,
    `error on held-out test games ${before.test.toFixed(5)} → ${after.test.toFixed(5)}. See REPORT.md §8.`,
  ].join('\n'));
  console.error(`Wrote ${path}`);
}
