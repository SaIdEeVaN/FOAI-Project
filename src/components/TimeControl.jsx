// Time controls in the chess.com / lichess style: "base+increment", base in
// minutes and increment in seconds added after each move.

const MIN = 60_000, SEC = 1_000;

export const TIME_CONTROLS = [
  { id: '1+0',   category: 'Bullet', base: 1 * MIN,  inc: 0 },
  { id: '2+1',   category: 'Bullet', base: 2 * MIN,  inc: 1 * SEC },
  { id: '3+0',   category: 'Blitz',  base: 3 * MIN,  inc: 0 },
  { id: '3+2',   category: 'Blitz',  base: 3 * MIN,  inc: 2 * SEC },
  { id: '5+0',   category: 'Blitz',  base: 5 * MIN,  inc: 0 },
  { id: '10+0',  category: 'Rapid',  base: 10 * MIN, inc: 0 },
  { id: '15+10', category: 'Rapid',  base: 15 * MIN, inc: 10 * SEC },
  { id: 'none',  category: 'Casual', base: 0,        inc: 0, label: 'No clock' },
];

export const DEFAULT_TIME_CONTROL = TIME_CONTROLS.find(tc => tc.id === '10+0');
export const findTimeControl = (id) => TIME_CONTROLS.find(tc => tc.id === id) || DEFAULT_TIME_CONTROL;
export const isTimed = (tc) => tc.base > 0;

// "10:00", "0:42", and tenths once under ten seconds: "0:07.3".
export function formatClock(ms) {
  const t = Math.max(0, ms);
  if (t < 10 * SEC) return `0:0${(Math.floor(t / 100) / 10).toFixed(1)}`;
  const s = Math.ceil(t / SEC);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Clock({ ms, active }) {
  const low = ms < 10 * SEC;
  return (
    <span className={`clock${active ? ' active' : ''}${low ? ' low' : ''}`} role="timer" aria-live="off">
      {formatClock(ms)}
    </span>
  );
}

const CATEGORIES = [...new Set(TIME_CONTROLS.map(tc => tc.category))];

export const describeTimeControl = (tc) => (isTimed(tc) ? `${tc.category} · ${tc.id}` : 'Casual · no clock');

// The grid of choices, shown only in the new-game dialog: a match keeps the
// time control it started with.
export function TimeControlOptions({ value, onChange }) {
  return (
    <div className="tc-grid" role="radiogroup" aria-label="Time control">
      {CATEGORIES.map(cat => (
        <div key={cat} className="tc-row">
          <span className="tc-cat">{cat}</span>
          <div className="tc-options">
            {TIME_CONTROLS.filter(tc => tc.category === cat).map(tc => (
              <button
                key={tc.id}
                type="button"
                role="radio"
                className="tc-btn"
                aria-checked={value.id === tc.id}
                onClick={() => onChange(tc)}
              >
                {tc.label || tc.id}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Read-only reminder beside the board of what this match is being played at.
export function TimeControlSummary({ value }) {
  return (
    <section className="panel tc-panel" aria-labelledby="tc-label">
      <div className="panel-head tc-summary">
        <h2 id="tc-label" className="panel-label">Time control</h2>
        <span className="tc-current">{describeTimeControl(value)}</span>
      </div>
    </section>
  );
}
