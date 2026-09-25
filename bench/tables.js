// Turns bench/results/experiments.json into the markdown tables in REPORT.md.
//
//   node bench/tables.js [bench/results/experiments.json]
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'bench/results/experiments.json';
const { positions, configs, rows, limitMs } = JSON.parse(readFileSync(file, 'utf8'));

const get = (position, config, depth) => rows.find(r => r.position === position && r.config === config && r.depth === depth);
const fmt = (n) => n.toLocaleString('en-US');
const geomean = (xs) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
const cell = (r) => (!r ? '' : `${r.aborted ? '≥ ' : ''}${fmt(r.nodes)}`);
const maxDepth = Math.max(...rows.map(r => r.depth));

const table = (header, body) =>
  [`| ${header.join(' | ')} |`, `|${header.map((_, i) => (i ? '---:' : '---')).join('|')}|`, ...body.map(r => `| ${r.join(' | ')} |`)].join('\n');

// 1. Nodes at depth 5, every position, every configuration.
const D = 5;
console.log(`### Nodes searched at depth ${D}\n`);
console.log(table(['Position', ...configs.map(c => c.label)],
  positions.map(p => [p.name, ...configs.map(c => cell(get(p.name, c.id, D)))])));

// 2. Reduction against plain minimax, by depth (geometric mean over the
// positions where minimax finished).
console.log(`\n### Node reduction against plain minimax (geometric mean over positions)\n`);
const depths = Array.from({ length: maxDepth }, (_, i) => i + 1);
console.log(table(['Configuration', ...depths.map(d => `d${d}`)],
  configs.slice(1).map(c => [c.label, ...depths.map(d => {
    const ratios = positions.map(p => {
      const base = get(p.name, 'minimax', d), r = get(p.name, c.id, d);
      return base && r && !base.aborted && !r.aborted ? base.nodes / r.nodes : null;
    }).filter(Boolean);
    return ratios.length ? `${geomean(ratios).toFixed(1)}× (${ratios.length})` : '';
  })])));

// 3. Effective branching factor: nodes(d) / nodes(d−1), geometric mean.
console.log(`\n### Effective branching factor, nodes(d) / nodes(d−1) (geometric mean over positions)\n`);
console.log(table(['Configuration', ...depths.slice(1).map(d => `d${d - 1}→d${d}`)],
  configs.map(c => [c.label, ...depths.slice(1).map(d => {
    const ratios = positions.map(p => {
      const a = get(p.name, c.id, d - 1), b = get(p.name, c.id, d);
      return a && b && !a.aborted && !b.aborted ? b.nodes / a.nodes : null;
    }).filter(Boolean);
    return ratios.length ? geomean(ratios).toFixed(2) : '';
  })])));

// 4. Agreement with plain minimax at the same depth.
console.log(`\n### Same answer as plain minimax? (positions × depths where minimax finished)\n`);
console.log(table(['Configuration', 'Same score', 'Same move'],
  configs.slice(1).map(c => {
    let n = 0, score = 0, move = 0;
    for (const p of positions) for (const d of depths) {
      const base = get(p.name, 'minimax', d), r = get(p.name, c.id, d);
      if (!base || !r || base.aborted || r.aborted) continue;
      n++;
      if (r.score === base.score) score++;
      if (r.move === base.move) move++;
    }
    return [c.label, `${score}/${n}`, `${move}/${n}`];
  })));

// 5. Speed.
console.log(`\n### Search speed (median nodes per second over runs of at least 0.2 s)\n`);
console.log(table(['Configuration', 'Nodes/s'], configs.map(c => {
  const speeds = rows.filter(r => r.config === c.id && r.timeMs >= 200).map(r => (r.nodes / r.timeMs) * 1000).sort((a, b) => a - b);
  return [c.label, speeds.length ? fmt(Math.round(speeds[Math.floor(speeds.length / 2)])) : ''];
})));

// 6. Deepest depth finished within the limit, per position.
console.log(`\n### Deepest search finished within ${limitMs / 1000} s\n`);
console.log(table(['Position', ...configs.map(c => c.label)],
  positions.map(p => [p.name, ...configs.map(c => {
    const done = rows.filter(r => r.position === p.name && r.config === c.id && !r.aborted);
    return done.length ? String(Math.max(...done.map(r => r.depth))) : '—';
  })])));

// 7. Tactics: first depth at which each configuration plays the known best move.
const tactics = positions.filter(p => p.best);
if (tactics.length) {
  console.log(`\n### First depth that finds the known best move\n`);
  console.log(table(['Position', ...configs.map(c => c.label)],
    tactics.map(p => [p.name, ...configs.map(c => {
      const hit = rows.filter(r => r.position === p.name && r.config === c.id && !r.aborted && r.move === p.best)
        .sort((a, b) => a.depth - b.depth)[0];
      return hit ? `d${hit.depth} (${hit.timeMs < 1000 ? `${hit.timeMs} ms` : `${(hit.timeMs / 1000).toFixed(1)} s`})` : '—';
    })])));
}
