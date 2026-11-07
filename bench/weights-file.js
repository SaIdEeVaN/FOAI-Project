// The hand-set evaluation weights, and the writer for src/engine/weights.js.
//
//   node bench/weights-file.js --hand     write the hand-set weights to src/engine/weights.js
//
// The hand-set weights are the starting point for bench/tune.js and the
// "before" in REPORT.md: the middlegame values are the evaluation as it was
// before tapering (same piece values and tables), with endgame values that
// differ only where the hand-written evaluation had nothing to say — chiefly
// a king that should walk to the centre once the queens are off.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PIECE_TYPES } from '../src/engine/evalLayout.js';

const PAWN   = [ 0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0 ];
const KNIGHT = [ -50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50 ];
const BISHOP = [ -20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20 ];
const ROOK   = [ 0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0 ];
const QUEEN  = [ -20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20 ];
const KING_MG = [ -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20 ];
// The endgame king: away from the edges, towards the centre.
const KING_EG = [ -50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50 ];

const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

export const HAND_WEIGHTS = {
  mg: {
    pieceValue: { ...VALUES },
    pst: { P: PAWN, N: KNIGHT, B: BISHOP, R: ROOK, Q: QUEEN, K: KING_MG },
    doubled: -15,
    isolated: -20,
    passed: [0, 5, 10, 15, 25, 40, 60, 0],
    bishopPair: 30,
    rookOpen: 20,
    rookSemiOpen: 10,
    kingFileOpen: -30,
    kingFileBare: -20,
    kingShield: 10,
    mobility: { N: 2, B: 2, R: 1 },
  },
  eg: {
    pieceValue: { ...VALUES },
    pst: { P: PAWN, N: KNIGHT, B: BISHOP, R: ROOK, Q: QUEEN, K: KING_EG },
    doubled: -15,
    isolated: -20,
    passed: [0, 10, 20, 35, 60, 90, 130, 0],
    bishopPair: 50,
    rookOpen: 10,
    rookSemiOpen: 5,
    kingFileOpen: 0,
    kingFileBare: 0,
    kingShield: 0,
    mobility: { N: 2, B: 2, R: 2 },
  },
};

const pad = (x) => String(x).padStart(4);

function formatPhase(w) {
  const lines = [];
  lines.push(`    pieceValue: { ${[...PIECE_TYPES].map(t => `${t}: ${w.pieceValue[t]}`).join(', ')} },`);
  lines.push('    pst: {');
  for (const t of PIECE_TYPES) {
    lines.push(`      ${t}: [`);
    for (let r = 0; r < 8; r++) lines.push(`        ${w.pst[t].slice(r * 8, r * 8 + 8).map(pad).join(',')},`);
    lines.push('      ],');
  }
  lines.push('    },');
  for (const k of ['doubled', 'isolated']) lines.push(`    ${k}: ${w[k]},`);
  lines.push(`    passed: [${w.passed.join(', ')}],`);
  for (const k of ['bishopPair', 'rookOpen', 'rookSemiOpen', 'kingFileOpen', 'kingFileBare', 'kingShield']) lines.push(`    ${k}: ${w[k]},`);
  lines.push(`    mobility: { N: ${w.mobility.N}, B: ${w.mobility.B}, R: ${w.mobility.R} },`);
  return lines.join('\n');
}

export function formatWeights(weights, provenance) {
  return `// Evaluation weights in centipawns: a middlegame (mg) and an endgame (eg) value
// for every parameter in evalLayout.js. Piece-square tables are from White's
// side with rank 8 first; Black reads them mirrored top to bottom.
//
${provenance.split('\n').map(l => `// ${l}`.trimEnd()).join('\n')}
export const WEIGHTS = {
  mg: {
${formatPhase(weights.mg)}
  },
  eg: {
${formatPhase(weights.eg)}
  },
};
`;
}

export function writeWeights(path, weights, provenance) {
  writeFileSync(path, formatWeights(weights, provenance));
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--hand')) {
  const path = fileURLToPath(new URL('../src/engine/weights.js', import.meta.url));
  writeWeights(path, HAND_WEIGHTS, 'Hand-set values (bench/weights-file.js), before any tuning.');
  console.log(`Wrote the hand-set weights to ${path}`);
}
