import { useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '../engine/board.js';
import { MoveGenerator } from '../engine/moveGen.js';
import { Evaluation } from '../engine/evaluation.js';
import { configKey } from '../engine/teachingSearch.js';
import { Piece } from './PieceSymbols.jsx';

const DEPTH = 5;
// Plain minimax on a busy middlegame can run for minutes; past this it stops and reports a lower bound.
const TIME_LIMIT_MS = 60_000;

const BASELINE   = { alphaBeta: false, ordering: false, tt: false, quiescence: false, nullMove: false };
const ALPHA_BETA = { ...BASELINE, alphaBeta: true };

const DEFAULT_TOGGLES = { alphaBeta: true, ordering: true, tt: true, quiescence: false, nullMove: false };

const PILLS = [
  { id: 'alphaBeta',  label: 'Alpha-Beta' },
  { id: 'ordering',   label: 'Move ordering' },
  { id: 'tt',         label: 'Transposition table' },
  { id: 'quiescence', label: 'Quiescence', needsAlphaBeta: true },
  { id: 'nullMove',   label: 'Null-move pruning', needsAlphaBeta: true },
];

const STATUS_COLORS = ['var(--red)', 'var(--amber)', 'var(--accent)'];

const EVAL_TERMS = [
  ['material', 'Material'],
  ['pieceSquare', 'Piece-square'],
  ['pawnStructure', 'Pawn structure'],
  ['kingSafety', 'King safety'],
  ['mobility', 'Mobility'],
];

const QUEUED = { status: 'queued', nodes: 0, timeMs: 0 };

// Node counts at a fixed depth are deterministic, so a finished search never needs repeating.
const resultCache = new Map();

// ── Formatting ────────────────────────────────────────────────────────────
const fmtNodes = (n) => n.toLocaleString('en-US');
const fmtTime  = (ms) => (ms < 100 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
const fmtRatio = (r) => (r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString('en-US'));
const fmtPawns = (cp) => (cp === 0 ? '0.00' : `${cp > 0 ? '+' : '−'}${(Math.abs(cp) / 100).toFixed(2)}`);

function joinAnd(words) {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

// Quiescence and null-move both lean on the alpha-beta window, so they switch off with it.
function effectiveConfig(toggles) {
  return {
    ...toggles,
    quiescence: toggles.alphaBeta && toggles.quiescence,
    nullMove: toggles.alphaBeta && toggles.nullMove,
  };
}

// The third card is named by what it changes relative to "+ Alpha-Beta".
function describeCustom(config) {
  const name = [
    !config.alphaBeta && '− Alpha-Beta',
    config.ordering && '+ MVV-LVA',
    config.tt && '+ TT',
    config.quiescence && '+ Quiescence',
    config.nullMove && '+ Null-move',
  ].filter(Boolean).join(' ') || 'No extras';

  const extras = [
    config.ordering && 'ordering',
    config.tt && 'memoisation',
    config.quiescence && 'quiescence',
    config.nullMove && 'null-move pruning',
  ].filter(Boolean);

  let description;
  if (extras.length) {
    const list = joinAnd(extras);
    description = `${list[0].toUpperCase()}${list.slice(1)} ${config.alphaBeta ? 'on top of' : 'without'} pruning.`;
  } else {
    description = config.alphaBeta
      ? 'Every extra switched off — the same search as Alpha-Beta.'
      : 'Everything switched off — the same search as plain minimax.';
  }
  return { name, description };
}

// Pruning and ordering only change the cost. Quiescence and null-move pruning can
// change the answer too, so the page stops promising the same move when either is on.
function describeAgreement({ quiescence, nullMove }) {
  if (!quiescence && !nullMove) return 'Same depth, same answer — only the cost changes.';
  const reasons = [
    quiescence && `quiescence keeps following captures past depth ${DEPTH}, so it sees further`,
    nullMove && 'null-move pruning skips lines it judges hopeless without fully checking them',
  ].filter(Boolean);
  return `The first two always agree on the move. The third card may not: ${reasons.join("; ")}.`;
}

// ── Search runner ─────────────────────────────────────────────────────────
// One dedicated worker, one config at a time. A search keeps running across pill
// toggles as long as some card still wants it; only unwanted searches are killed.
function createRunner(boardState, positionKey, patchRun) {
  let worker = null;
  let running = null;
  let wanted = [];

  const stop = () => {
    worker?.terminate();
    worker = null;
    if (running) patchRun(running, QUEUED);
    running = null;
  };

  const startNext = () => {
    if (running) return;
    const next = wanted.find(c => !resultCache.has(`${positionKey}#${c.key}`));
    if (!next) return;

    if (!worker) {
      const w = new Worker(new URL('../engine/worker.js', import.meta.url), { type: 'module' });
      w.onmessage = ({ data: { type, payload } }) => {
        if (w !== worker) return; // Terminated — ignore stragglers
        if (type === 'teachStart') patchRun(payload.key, { status: 'running', nodes: 0, timeMs: 0 });
        if (type === 'teachProgress') patchRun(payload.key, { nodes: payload.nodes, timeMs: payload.timeMs });
        if (type === 'teachResult') {
          const { key, ...result } = payload;
          const run = { status: 'done', ...result };
          resultCache.set(`${positionKey}#${key}`, run);
          running = null;
          patchRun(key, run);
          startNext();
        }
      };
      worker = w;
    }

    running = next.key;
    worker.postMessage({
      type: 'teach',
      payload: { boardState, depth: DEPTH, configs: [next], timeLimitMs: TIME_LIMIT_MS },
    });
  };

  return {
    want(cards) {
      wanted = cards;
      if (running && !cards.some(c => c.key === running)) stop();
      startNext();
    },
    stop,
  };
}

// ── Hooks ─────────────────────────────────────────────────────────────────
function useTweenedNumber(value, duration = 600) {
  const [display, setDisplay] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    const start = performance.now();
    let raf;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.round(from + (value - from) * (1 - (1 - t) ** 3));
      current.current = v;
      setDisplay(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
}

// ── Pieces of the screen ──────────────────────────────────────────────────
function relativeCost(run, baseline, isBaseline) {
  if (isBaseline) return 'baseline';
  if (run.aborted) return '—';
  if (baseline.status !== 'done') return 'awaiting baseline';
  const ratio = baseline.nodes / run.nodes;
  if (ratio < 1) return `${fmtRatio(1 / ratio)}× more`;
  return `${baseline.aborted ? '≥ ' : ''}${fmtRatio(ratio)}× fewer`;
}

function ComparisonCard({ card, run, color, isWinner, isBaseline, baseline, scaleNodes, hasMoves }) {
  const nodes = useTweenedNumber(run.nodes);
  const running = run.status === 'running';
  const pct = run.nodes ? Math.max(1.5, Math.min(100, (run.nodes / scaleNodes) * 100)) : 0;

  let footLeft, footRight;
  if (run.status === 'queued') {
    footLeft = hasMoves ? 'queued' : 'no legal moves';
    footRight = '';
  } else if (running) {
    footLeft = fmtTime(run.timeMs);
    footRight = 'searching…';
  } else {
    footLeft = run.aborted ? `stopped at ${fmtTime(run.timeMs)}` : fmtTime(run.timeMs);
    footRight = relativeCost(run, baseline, isBaseline);
  }

  return (
    <article className={`tm-cmp${isWinner ? ' winner' : ''}`} style={{ '--status': color }}>
      <h3 className="tm-cmp-name">{card.name}</h3>
      <p className="tm-cmp-desc">{card.description}</p>
      <p className={`tm-nodes${running ? ' running' : ''}`}>
        {run.status === 'queued' ? '—' : `${run.aborted ? '≥ ' : ''}${fmtNodes(nodes)}`}
      </p>
      <p className="tm-nodes-label">nodes searched</p>
      <div className="tm-bar">
        <div className={`tm-bar-fill${running ? ' running' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="tm-cmp-foot">
        <span>{footLeft}</span>
        <span>{footRight}</span>
      </div>
    </article>
  );
}

function MiniBoard({ squares, lastMove, flip }) {
  return (
    <div className="tm-board" role="img" aria-label="Snapshot of the current game position">
      {Array.from({ length: 64 }, (_, i) => {
        const sq = flip ? 63 - i : i;
        const light = (Math.floor(sq / 8) + (sq % 8)) % 2 === 0;
        const lit = lastMove && (lastMove.from === sq || lastMove.to === sq);
        const piece = squares[sq];
        return (
          <div key={sq} className={`tm-sq ${light ? 'light' : 'dark'}${lit ? ' lit' : ''}`}>
            {piece !== '.' && <Piece piece={piece} />}
          </div>
        );
      })}
    </div>
  );
}

function EvalBreakdown({ breakdown }) {
  const scale = Math.max(50, ...EVAL_TERMS.map(([key]) => Math.abs(breakdown[key])));
  return (
    <div className="tm-eval">
      {EVAL_TERMS.map(([key, label]) => {
        const value = breakdown[key];
        const color = value === 0 ? '#8B9199' : value > 0 ? 'var(--accent)' : 'var(--red)';
        return (
          <div key={key} className="tm-eval-row">
            <span className="tm-eval-label">{label}</span>
            <div className="tm-eval-track">
              <div className="tm-eval-fill" style={{ width: `${Math.max(2, (Math.abs(value) / scale) * 100)}%`, background: color }} />
            </div>
            <span className="tm-eval-val" style={{ color }}>{fmtPawns(value)}</span>
          </div>
        );
      })}
      <div className="tm-eval-row tm-eval-total">
        <span className="tm-eval-label">Total</span>
        <span />
        <span className="tm-eval-val">{fmtPawns(breakdown.total)}</span>
      </div>
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────
export default function TeachingMode({ boardState, lastMove, flip }) {
  // Snapshot on open; the game can carry on underneath without changing this screen.
  const [snapshot] = useState(() => ({ boardState, lastMove }));
  const [toggles, setToggles] = useState(DEFAULT_TOGGLES);
  const [live, setLive] = useState({});
  const runnerRef = useRef(null);

  const positionKey = useMemo(() => JSON.stringify(snapshot.boardState), [snapshot]);
  const { breakdown, hasMoves } = useMemo(() => {
    const board = new Board();
    board.loadFrom(snapshot.boardState);
    return {
      breakdown: new Evaluation().breakdown(board),
      hasMoves: new MoveGenerator(board).generateLegalMoves().length > 0,
    };
  }, [snapshot]);

  const custom = effectiveConfig(toggles);
  const cards = [
    { name: 'Plain Minimax', description: 'No pruning, no ordering.', config: BASELINE },
    { name: '+ Alpha-Beta', description: 'Prunes branches that cannot affect the result.', config: ALPHA_BETA },
    { ...describeCustom(custom), config: custom },
  ].map(card => ({ ...card, key: configKey(card.config) }));
  const cardKeys = cards.map(c => c.key).join(',');

  useEffect(() => {
    const runner = createRunner(snapshot.boardState, positionKey, (key, patch) =>
      setLive(prev => ({ ...prev, [key]: { ...prev[key], ...patch } })));
    runnerRef.current = runner;
    return () => runner.stop();
  }, [snapshot, positionKey]);

  useEffect(() => {
    // Cheapest first: pruned results land in seconds while plain minimax grinds on last.
    if (hasMoves) runnerRef.current.want([...cards].reverse());
  }, [cardKeys, hasMoves]); // eslint-disable-line react-hooks/exhaustive-deps

  const runs = cards.map(c => resultCache.get(`${positionKey}#${c.key}`) || live[c.key] || QUEUED);
  const baseline = runs[0];
  const scaleNodes = baseline.status === 'done' ? baseline.nodes : Math.max(1, ...runs.map(r => r.nodes));
  const allDone = runs.every(r => r.status === 'done');

  let winner = -1;
  if (allDone) {
    runs.forEach((r, i) => {
      if (!r.aborted && (winner === -1 || r.nodes <= runs[winner].nodes)) winner = i;
    });
  }

  let caption;
  if (!hasMoves) {
    caption = 'no legal moves — the game is over';
  } else if (!allDone) {
    caption = 'searching…';
  } else if (runs.every(r => r.move === runs[0].move)) {
    caption = <>all three agree: <span className="tm-accent">{runs[0].move}</span></>;
  } else {
    caption = (
      <>best moves differ:{' '}
        {runs.map((r, i) => (
          <span key={i}>{i > 0 && ' · '}<span style={{ color: STATUS_COLORS[i] }}>{r.move ?? '—'}</span></span>
        ))}
      </>
    );
  }

  return (
    <main className="tm-page">
      <section className="tm" aria-labelledby="tm-title">
        <header className="tm-head">
          <h2 id="tm-title" className="tm-title">Teaching mode</h2>
          <span className="tm-meta">position: current game · fixed depth {DEPTH}</span>
        </header>
        <p className="tm-sub">
          Run the same position through three configurations and compare the work each one does.
          {' '}{describeAgreement(custom)}
        </p>

        <div className="tm-compare">
          {cards.map((card, i) => (
            <ComparisonCard
              key={i}
              card={card}
              run={runs[i]}
              color={STATUS_COLORS[i]}
              isWinner={i === winner}
              isBaseline={i === 0}
              baseline={baseline}
              scaleNodes={scaleNodes}
              hasMoves={hasMoves}
            />
          ))}
        </div>

        <div className="tm-body">
          <div className="tm-board-col">
            <MiniBoard squares={snapshot.boardState.squares} lastMove={snapshot.lastMove} flip={flip} />
            <p className="tm-caption" aria-live="polite">{caption}</p>
          </div>

          <div className="tm-right">
            <section className="tm-section">
              <h3 className="tm-label">Toggle a technique and re-run</h3>
              <div className="tm-pills">
                {PILLS.map(pill => {
                  const disabled = pill.needsAlphaBeta && !toggles.alphaBeta;
                  const on = custom[pill.id];
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      disabled={disabled}
                      title={disabled ? 'Needs Alpha-Beta' : undefined}
                      className={`tm-pill${on ? ' on' : ''}`}
                      onClick={() => setToggles(t => ({ ...t, [pill.id]: !t[pill.id] }))}
                    >
                      <span className="tm-pill-dot" aria-hidden="true" />
                      {pill.label}
                    </button>
                  );
                })}
              </div>
              <p className="tm-note">
                The first two cards are fixed references; the third follows these switches.
              </p>
            </section>

            <section className="tm-section">
              <h3 className="tm-label">Evaluation breakdown</h3>
              <EvalBreakdown breakdown={breakdown} />
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
