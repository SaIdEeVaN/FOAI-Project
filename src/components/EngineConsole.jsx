import { useEffect, useRef } from 'react';
import { formatScore } from './score.js';

const fmtNodes = (n) => n.toLocaleString('en-US');

export default function EngineConsole({ telemetry, logLines, evalScore, thinking }) {
  const logRef = useRef(null);

  // The newest iteration is the interesting one, so keep it in view.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logLines.length]);

  // evalScore: positive = White advantage (centipawns)
  const scoreStr = formatScore(evalScore, { sign: true });
  const scoreTone = evalScore === 0 ? '' : evalScore > 0 ? ' accent' : ' warn';

  const stats = [
    { key: 'Best move', value: telemetry?.move || '—', tone: ' accent' },
    { key: 'Depth', value: telemetry?.depth ?? '—' },
    { key: 'Nodes', value: fmtNodes(telemetry?.nodes ?? 0) },
    { key: 'Score', value: scoreStr, tone: scoreTone },
  ];

  return (
    <section className="panel engine-panel" aria-labelledby="ec-label">
      <div className="panel-head">
        <h2 id="ec-label" className="panel-label">Engine console</h2>
        {thinking
          ? <span className="badge searching">searching…</span>
          : <span className="panel-meta">idle</span>}
      </div>

      <div className="stat-grid">
        {stats.map(({ key, value, tone = '' }) => (
          <div key={key} className="stat">
            <span className="stat-key">{key}</span>
            <span className={`stat-val${tone}`}>{value}</span>
          </div>
        ))}
      </div>

      <div className="log" ref={logRef} aria-live="polite">
        {logLines.length === 0 ? (
          <p className="log-line empty">Awaiting first engine move…</p>
        ) : (
          logLines.map((line, i) => (
            <p key={i} className={`log-line${i === logLines.length - 1 ? ' log-latest' : ''}`}>{line}</p>
          ))
        )}
      </div>
    </section>
  );
}
