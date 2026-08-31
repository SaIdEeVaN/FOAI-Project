export default function MoveHistory({ moves }) {
  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ num: Math.floor(i / 2) + 1, white: moves[i], black: moves[i + 1] || '' });
  }

  return (
    <div className="panel">
      <p className="panel-label">Move History</p>
      {!pairs.length ? (
        <p className="muted">No moves yet</p>
      ) : (
        <div className="move-table">
          {pairs.map(({ num, white, black }, i) => (
            <div key={num} className="move-row">
              <span className="move-num">{num}.</span>
              <span className={`move-cell ${i === pairs.length - 1 && moves.length % 2 === 1 ? 'move-latest' : ''}`}>{white}</span>
              <span className={`move-cell ${i === pairs.length - 1 && moves.length % 2 === 0 && black ? 'move-latest' : ''}`}>{black}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
