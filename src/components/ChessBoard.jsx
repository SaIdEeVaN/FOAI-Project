// Chess board component

// Solid (filled) chess pieces — use the "black" filled Unicode symbols for all pieces,
// then colour them via CSS so white pieces appear white and black pieces appear black.
const PIECE_UNICODE = {
  K:'♚', Q:'♛', R:'♜', B:'♝', N:'♞', P:'♟',
  k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟',
};

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

export default function ChessBoard({ squares, selectedSq, legalTargets, lastMove, checkSq, onSquareClick, flip = false }) {
  const displayRanks = flip ? [...RANKS].reverse() : RANKS;
  const displayFiles = flip ? [...FILES].reverse() : FILES;

  return (
    <div className="board-wrap">
      {/* Rank labels left */}
      <div className="coord-ranks">
        {displayRanks.map(r => <span key={r} className="coord-label">{r}</span>)}
      </div>

      <div className="board-inner">
        <div className="board-grid">
          {Array.from({ length: 64 }).map((_, i) => {
            const sq = flip ? 63 - i : i;
            const piece = squares[sq];
            const rank = Math.floor(sq / 8);
            const file = sq % 8;
            const isLight = (rank + file) % 2 === 0;
            const isSelected  = selectedSq === sq;
            const isLegal     = legalTargets.includes(sq);
            const isLastFrom  = lastMove?.from === sq;
            const isLastTo    = lastMove?.to === sq;
            const isCheck     = checkSq === sq;
            const hasPiece    = piece !== '.';

            let cls = `square ${isLight ? 'light' : 'dark'}`;
            if (isSelected)  cls += ' selected';
            if (isLastFrom)  cls += ' last-from';
            if (isLastTo)    cls += ' last-to';
            if (isCheck)     cls += ' in-check';

            return (
              <div key={sq} className={cls} onClick={() => onSquareClick(sq)}>
                {isLegal && (
                  <div className={hasPiece ? 'hint-ring' : 'hint-dot'} />
                )}
                {hasPiece && (
                  <span className={`piece ${piece === piece.toUpperCase() ? 'white-piece' : 'black-piece'}`}>
                    {PIECE_UNICODE[piece]}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* File labels bottom */}
        <div className="coord-files">
          {displayFiles.map(f => <span key={f} className="coord-label">{f}</span>)}
        </div>
      </div>
    </div>
  );
}
