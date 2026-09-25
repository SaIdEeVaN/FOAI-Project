// The playable board. Pieces are the same SVG symbol set the teaching-mode board uses —
// see PieceSymbols.jsx for why the Unicode glyphs had to go.

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Piece, pieceName } from './PieceSymbols.jsx';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const squareName = (sq) => `${FILES[sq % 8]}${RANKS[Math.floor(sq / 8)]}`;

// Spring config for natural piece movement
const PIECE_SPRING = { type: 'spring', stiffness: 500, damping: 35, mass: 0.8 };

function ChessPiece({ piece, isCapture }) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={piece}
        className="piece"
        initial={isCapture ? { scale: 1.4, opacity: 0 } : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0, rotate: isCapture ? 45 : 0 }}
        transition={PIECE_SPRING}
        layout
      >
        <Piece piece={piece} />
      </motion.span>
    </AnimatePresence>
  );
}

export default function ChessBoard({ squares, selectedSq, legalTargets, lastMove, checkSq, premove, onSquareClick, onCancelPremove, flip = false }) {
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
    // Right-click anywhere on the board cancels a premove, as on most chess sites.
    <div className="board-frame" onContextMenu={(e) => { e.preventDefault(); onCancelPremove?.(); }}>
      <LayoutGroup>
        <div className="board-grid" role="group" aria-label="Chess board">
          {Array.from({ length: 64 }).map((_, i) => {
            const sq = flip ? 63 - i : i;
            const piece = squares[sq];
            const rank = Math.floor(sq / 8);
            const file = sq % 8;
            const isLight = (rank + file) % 2 === 0;
            const isSelected = selectedSq === sq;
            const isLegal = legalTargets.includes(sq);
            const isLastFrom = lastMove?.from === sq;
            const isLastTo = lastMove?.to === sq;
            const isCheck = checkSq === sq;
            const hasPiece = piece !== '.';

            let cls = `square ${isLight ? 'light' : 'dark'}`;
            if (isSelected) cls += ' selected';
            if (isLastFrom) cls += ' last-from';
            if (isLastTo) cls += ' last-to';
            if (isCheck) cls += ' in-check';
            if (premove && (premove.from === sq || premove.to === sq)) cls += ' premove';

            // Coordinates ride in the margins of the board itself, so the grid stays flush
            // with the evaluation bar beside it.
            const showRank = i % 8 === 0;
            const showFile = Math.floor(i / 8) === 7;

            // Staggered entrance delay per square
            const entranceDelay = hasEntered ? 0 : i * 0.005;
            const label = `${squareName(sq)}${hasPiece ? `, ${pieceName(piece)}` : ', empty'}`;

            return (
              <motion.div
                key={sq}
                className={cls}
                role="button"
                aria-label={label}
                aria-pressed={isSelected}
                tabIndex={hasPiece || isLegal ? 0 : -1}
                onClick={() => onSquareClick(sq)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSquareClick(sq);
                  }
                }}
                initial={!hasEntered ? { opacity: 0, scale: 0.85 } : false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, delay: entranceDelay, ease: 'easeOut' }}
                whileTap={{ scale: 0.94 }}
              >
                {showRank && <span className="sq-coord rank" aria-hidden="true">{RANKS[rank]}</span>}
                {showFile && <span className="sq-coord file" aria-hidden="true">{FILES[file]}</span>}
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
                  <ChessPiece piece={piece} isCapture={capturedSqs.current.has(sq)} />
                )}
              </motion.div>
            );
          })}
        </div>
      </LayoutGroup>
    </div>
  );
}
