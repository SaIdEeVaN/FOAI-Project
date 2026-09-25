import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Piece, pieceName } from './PieceSymbols.jsx';
import { TimeControlOptions } from './TimeControl.jsx';
import { CONTEMPT_LIMIT, CONTEMPT_STEP, describeContempt } from './contempt.js';

const CARD_IN  = { scale: 0.75, opacity: 0, y: 30 };
const CARD_MID = { scale: 1, opacity: 1, y: 0 };
const CARD_OUT = { scale: 0.85, opacity: 0, y: 20 };
const SPRING   = { type: 'spring', stiffness: 400, damping: 28 };

// Closing the card — its main button, a click outside it or Escape — goes back
// to the board with the finished game still on it. A new game is one click
// away, but only when asked for.
export function GameOverModal({ gameEnd, onClose, onNewGame }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      className="overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-title"
        onClick={e => e.stopPropagation()}
        initial={CARD_IN}
        animate={CARD_MID}
        exit={CARD_OUT}
        transition={SPRING}
      >
        <motion.span
          className="modal-icon"
          animate={{ rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          {gameEnd.winner
            ? <Piece piece={gameEnd.winner === 'White' ? 'K' : 'k'} />
            : <span className="modal-draw">½</span>}
        </motion.span>
        <p className="modal-eyebrow">Game over</p>
        <h2 id="game-over-title" className="modal-title">
          {gameEnd.winner ? `${gameEnd.winner} wins` : 'Draw'}
        </h2>
        <p className="modal-sub">
          {gameEnd.type === 'checkmate' ? 'by checkmate'
            : gameEnd.type === 'resign' ? 'by resignation'
            : gameEnd.type === 'timeout' ? 'on time'
            : `by ${gameEnd.reason.toLowerCase()}`}
        </p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onNewGame}>New game</button>
          <button className="btn btn-primary" onClick={onClose} autoFocus>Back to board</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function PromotionModal({ color, onPick, onCancel }) {
  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a promotion piece"
        initial={{ scale: 0.7, opacity: 0, y: 20 }}
        animate={CARD_MID}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 450, damping: 30 }}
      >
        <p className="modal-eyebrow">Promotion</p>
        <h2 className="modal-title">Choose a piece</h2>
        <div className="promo-row">
          {['q', 'r', 'n', 'b'].map((p, idx) => {
            const piece = color === 'w' ? p.toUpperCase() : p;
            return (
              <motion.button
                key={p}
                type="button"
                className="promo-btn"
                onClick={() => onPick(p)}
                aria-label={pieceName(piece)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06, type: 'spring', stiffness: 500, damping: 30 }}
                whileHover={{ scale: 1.12, y: -4 }}
                whileTap={{ scale: 0.95 }}
              >
                <Piece piece={piece} />
              </motion.button>
            );
          })}
        </div>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </motion.div>
    </motion.div>
  );
}

const SIDES = [
  { id: 'random', label: 'Random', piece: null },
  { id: 'w', label: 'White', piece: 'K' },
  { id: 'b', label: 'Black', piece: 'k' },
];

// Shown before every match: the time control is fixed here and cannot change once
// the game is under way. `onCancel` is absent when there is no game to go back to.
export function NewGameModal({ timeControl, contempt, side, onStart, onCancel }) {
  const [tc, setTc] = useState(timeControl);
  const [pick, setPick] = useState(side);
  const [cp, setCp] = useState(contempt);

  return (
    <motion.div
      className="overlay"
      onClick={onCancel}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="modal setup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        onClick={e => e.stopPropagation()}
        initial={CARD_IN}
        animate={CARD_MID}
        exit={CARD_OUT}
        transition={SPRING}
      >
        <div>
          <p className="modal-eyebrow">New game</p>
          <h2 id="setup-title" className="modal-title">Choose a time control</h2>
        </div>

        <section className="setup-section">
          <TimeControlOptions value={tc} onChange={setTc} />
        </section>

        <section className="setup-section">
          <p className="modal-eyebrow">Play as</p>
          <div className="setup-sides" role="radiogroup" aria-label="Play as">
            {SIDES.map(s => (
              <button key={s.id} type="button" role="radio" className="tc-btn"
                aria-checked={pick === s.id} onClick={() => setPick(s.id)}>
                {s.piece && <Piece piece={s.piece} />}
                {s.label}
              </button>
            ))}
          </div>
        </section>

        <section className="setup-section">
          <div className="setup-label-row">
            <label className="modal-eyebrow" htmlFor="setup-contempt">Engine contempt</label>
            <span className="setup-value">{describeContempt(cp)}</span>
          </div>
          <input
            id="setup-contempt"
            className="setup-range"
            type="range"
            min={-CONTEMPT_LIMIT}
            max={CONTEMPT_LIMIT}
            step={CONTEMPT_STEP}
            value={cp}
            onChange={e => setCp(Number(e.target.value))}
            aria-valuetext={describeContempt(cp)}
          />
          <div className="setup-range-ends" aria-hidden="true">
            <span>Seeks draws</span>
            <span>Avoids draws</span>
          </div>
        </section>

        <div className="setup-actions">
          {onCancel && <button className="btn btn-ghost" onClick={onCancel}>Back to game</button>}
          <button className="btn btn-primary" onClick={() => onStart(tc, pick, cp)} autoFocus>Start game</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
