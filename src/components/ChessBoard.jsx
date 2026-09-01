// Chess board component with framer-motion animations

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';

// Solid (filled) chess pieces — use the "black" filled Unicode symbols for all pieces,
// then colour them via CSS / inline style so white pieces appear white and black pieces appear black.
const PIECE_UNICODE = {
  K:'♚', Q:'♛', R:'♜', B:'♝', N:'♞', P:'♟',
  k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟',
};

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

// Spring config for natural piece movement
const PIECE_SPRING = { type: 'spring', stiffness: 500, damping: 35, mass: 0.8 };

function ChessPiece({ piece, isWhite, isCapture }) {
  // Mobile fix: use WebkitTextFillColor to override OS emoji rendering
  const style = isWhite
    ? {
        color: '#FAFAF8',
        WebkitTextFillColor: '#FAFAF8',
        textShadow: '0 0 3px #000, 0 1px 4px rgba(0,0,0,0.85)',
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))',
      }
    : {
        color: '#1A1A18',
        WebkitTextFillColor: '#1A1A18',
        textShadow: '0 0 2px rgba(255,255,255,0.25), 0 1px 3px rgba(0,0,0,0.6)',
        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))',
      };

  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={piece}
        className="piece"
        style={style}
        initial={isCapture ? { scale: 1.4, opacity: 0 } : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0, rotate: isCapture ? 45 : 0 }}
        transition={PIECE_SPRING}
        layout
        layoutId={undefined}
      >
        {PIECE_UNICODE[piece]}
      </motion.span>
    </AnimatePresence>
  );
}

export default function ChessBoard({ squares, selectedSq, legalTargets, lastMove, checkSq, onSquareClick, flip = false }) {
  const displayRanks = flip ? [...RANKS].reverse() : RANKS;
  const displayFiles = flip ? [...FILES].reverse() : FILES;

  const [hasEntered, setHasEntered] = useState(false);
  const prevSquares = useRef(squares);

  useEffect(() => {
    const t = setTimeout(() => setHasEntered(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Track which squares had a piece captured (for flash effect)
  const capturedSqs = useRef(new Set());
  useEffect(() => {
    const prev = prevSquares.current;
    const newCaptured = new Set();
    squares.forEach((p, i) => {
      if (prev[i] !== '.' && p === '.') newCaptured.add(i);
    });
    capturedSqs.current = newCaptured;
    prevSquares.current = squares;
  }, [squares]);

  return (
    <div className="board-wrap">
      {/* Rank labels left */}
      <div className="coord-ranks">
        {displayRanks.map(r => <span key={r} className="coord-label">{r}</span>)}
      </div>

      <div className="board-inner">
        <LayoutGroup>
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
              const isWhite     = hasPiece && piece === piece.toUpperCase();

              let cls = `square ${isLight ? 'light' : 'dark'}`;
              if (isSelected)  cls += ' selected';
              if (isLastFrom)  cls += ' last-from';
              if (isLastTo)    cls += ' last-to';
              if (isCheck)     cls += ' in-check';

              // Staggered entrance delay per square
              const entranceDelay = hasEntered ? 0 : (i * 0.005);

              return (
                <motion.div
                  key={sq}
                  className={cls}
                  onClick={() => onSquareClick(sq)}
                  initial={!hasEntered ? { opacity: 0, scale: 0.85 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25, delay: entranceDelay, ease: 'easeOut' }}
                  whileTap={{ scale: 0.94 }}
                >
                  {isLegal && (
                    <motion.div
                      className={hasPiece ? 'hint-ring' : 'hint-dot'}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                    />
                  )}
                  {hasPiece && (
                    <ChessPiece
                      piece={piece}
                      isWhite={isWhite}
                      isCapture={capturedSqs.current.has(sq)}
                    />
                  )}
                </motion.div>
              );
            })}
          </div>
        </LayoutGroup>

        {/* File labels bottom */}
        <div className="coord-files">
          {displayFiles.map(f => <span key={f} className="coord-label">{f}</span>)}
        </div>
      </div>
    </div>
  );
}
