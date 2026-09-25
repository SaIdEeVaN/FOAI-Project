import { useEffect, useRef } from 'react';

// `moves` is the game so far as { uci, san }; the list shows SAN.
export default function MoveHistory({ moves }) {
  const scrollRef = useRef(null);

  // Keep the newest pair in view as the game grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [moves.length]);

  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ num: Math.floor(i / 2) + 1, white: moves[i].san, black: moves[i + 1]?.san || '' });
  }
  const latest = moves.length - 1;

  return (
    <section className="panel" aria-labelledby="mh-label">
      <div className="panel-head">
        <h2 id="mh-label" className="panel-label">Move history</h2>
        <span className="panel-meta">{moves.length} {moves.length === 1 ? 'ply' : 'plies'}</span>
      </div>

      {!pairs.length ? (
        <p className="empty">No moves yet — click a piece or type a move to start.</p>
      ) : (
        <div className="move-table" ref={scrollRef}>
          <div className="move-row move-head-row">
            <span />
            <span>White</span>
            <span>Black</span>
          </div>
          {pairs.map(({ num, white, black }, i) => (
            <div key={num} className="move-row">
              <span className="move-num">{num}.</span>
              <span className={`move-cell${i * 2 === latest ? ' move-latest' : ''}`}>{white}</span>
              <span className={`move-cell${i * 2 + 1 === latest ? ' move-latest' : ''}`}>{black || '·'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
