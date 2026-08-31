export default function EngineConsole({ telemetry, logLines, evalScore, thinking }) {
  // evalScore: positive = White advantage (centipawns)
  const clamped   = Math.max(-800, Math.min(800, evalScore));
  const whitePct  = Math.round(50 + (clamped / 800) * 50);
  const blackPct  = 100 - whitePct;
  const scoreStr  = evalScore === 0 ? '0.00' : (evalScore > 0 ? '+' : '') + (evalScore / 100).toFixed(2);

  return (
    <div className="panel engine-panel">
      <div className="panel-header">
        <p className="panel-label">Engine Console</p>
        {thinking && <span className="thinking-pill">searching…</span>}
      </div>

      {/* Eval bar */}
      <div className="eval-section">
        <div className="eval-bar-track">
          <div className="eval-bar-white" style={{ width: `${whitePct}%` }} />
          <div className="eval-bar-black" style={{ width: `${blackPct}%` }} />
        </div>
        <div className="eval-labels">
          <span>White</span>
          <span className="eval-score">{scoreStr}</span>
          <span>Black</span>
        </div>
      </div>

      {/* Telemetry grid */}
      {telemetry && (
        <div className="tele-grid">
          <div className="tele-item">
            <span className="tele-key">Best Move</span>
            <span className="tele-val accent">{telemetry.move || '—'}</span>
          </div>
          <div className="tele-item">
            <span className="tele-key">Depth</span>
            <span className="tele-val">{telemetry.depth ?? '—'}</span>
          </div>
          <div className="tele-item">
            <span className="tele-key">Nodes</span>
            <span className="tele-val">{(telemetry.nodes ?? 0).toLocaleString()}</span>
          </div>
          <div className="tele-item">
            <span className="tele-key">Score</span>
            <span className="tele-val">{scoreStr}</span>
          </div>
        </div>
      )}

      {/* Log */}
      <div className="engine-log">
        {logLines.length === 0 ? (
          <p className="muted log-line">Awaiting first engine move…</p>
        ) : (
          logLines.map((line, i) => (
            <p key={i} className="log-line">{line}</p>
          ))
        )}
      </div>
    </div>
  );
}
