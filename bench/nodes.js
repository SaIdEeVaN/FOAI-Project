// Fixed-depth node counts for the game search, engine against engine.
//
//   node bench/nodes.js --depth 7 --engines base=foai@<old-engine-dir>,new=foai [--out file.json]
//   node bench/nodes.js --depth 7 --engines none=foai:killers=false:history=false,killers=foai:history=false,both=foai
//
// Engines are written [label=]foai[@dir][:option=value…], with SearchEngine
// options as in bench/match.js. Every position of bench/experiments.js is searched to the same depth by each
// engine, with a fresh transposition table and no game history. At a fixed
// depth the node count is exact and repeatable, so it measures move ordering
// directly: an engine that tries the refuting move first searches fewer nodes
// to reach the same depth. Times are single-core; positions run one at a time.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { POSITIONS } from './experiments.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const depth = Number(arg('depth', 6));
const specs = arg('engines', 'foai').split(',');
const out = arg('out', null);

async function loadEngine(full) {
  const eq = full.indexOf('=');
  const label = eq >= 0 && eq < full.indexOf('foai') ? full.slice(0, eq) : full;
  const [head, ...opts] = full.slice(full.indexOf('foai')).split(':');
  const at = head.indexOf('@');
  const dir = at >= 0 ? resolve(head.slice(at + 1)) : resolve('src/engine');
  const options = Object.fromEntries(opts.map(o => {
    const [k, v] = o.split('=');
    return [k, v === 'true' ? true : v === 'false' ? false : Number(v)];
  }));
  const load = (f) => import(pathToFileURL(resolve(dir, f)).href);
  const { Board } = await load('board.js');
  const { SearchEngine } = await load('search.js');
  return { spec: label, Board, SearchEngine, options };
}

const engines = await Promise.all(specs.map(loadEngine));
const labels = engines.map(e => e.spec);
const rows = [];
for (const p of POSITIONS) {
  const row = { position: p.name, phase: p.phase };
  for (const { spec, Board, SearchEngine, options } of engines) {
    const board = new Board();
    board.parseFen(p.fen);
    const t0 = performance.now();
    const r = new SearchEngine(board, [board.positionKey()], options).getBestMove(Infinity, null, { maxDepth: depth });
    row[spec] = { nodes: r.nodes, ms: Math.round(performance.now() - t0), move: r.bestMove?.toUci() ?? null, score: r.score };
  }
  rows.push(row);
  console.error(`${p.name.padEnd(28)} ${labels.map(s => `${String(row[s].nodes).padStart(10)} ${row[s].move}`).join('   ')}`);
}

const geomean = (xs) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
const fmt = (n) => n.toLocaleString('en-US');
const [first, ...rest] = labels;
console.log(`\nDepth ${depth}, ${rows.length} positions`);
console.log(`| Position | ${labels.map(s => `${s} nodes`).join(' | ')} | ${rest.map(s => `${s} / ${first}`).join(' | ')} |`);
console.log(`|---|${labels.map(() => '---:').join('|')}|${rest.map(() => '---:').join('|')}|`);
for (const r of rows) {
  console.log(`| ${r.position} | ${labels.map(s => fmt(r[s].nodes)).join(' | ')} | ${rest.map(s => (r[s].nodes / r[first].nodes).toFixed(2)).join(' | ')} |`);
}
console.log(`| **Geometric mean ratio** | ${labels.map(() => '').join(' | ')} | ${rest.map(s => geomean(rows.map(r => r[s].nodes / r[first].nodes)).toFixed(3)).join(' | ')} |`);
for (const s of labels) {
  const nodes = rows.reduce((a, r) => a + r[s].nodes, 0), ms = rows.reduce((a, r) => a + r[s].ms, 0);
  console.log(`${s}: ${fmt(nodes)} nodes in ${(ms / 1000).toFixed(1)} s (${fmt(Math.round(nodes / ms * 1000))} n/s)`);
}
const same = rows.filter(r => rest.every(s => r[s].move === r[first].move)).length;
console.log(`Same best move in ${same}/${rows.length} positions`);
if (out) writeFileSync(out, JSON.stringify({ depth, engines: specs, labels, rows }, null, 1));
