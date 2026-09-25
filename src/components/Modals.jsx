import { motion } from 'framer-motion';
import { Piece, pieceName } from './PieceSymbols.jsx';

const CARD_IN  = { scale: 0.75, opacity: 0, y: 30 };
const CARD_MID = { scale: 1, opacity: 1, y: 0 };
const CARD_OUT = { scale: 0.85, opacity: 0, y: 20 };
const SPRING   = { type: 'spring', stiffness: 400, damping: 28 };

export function GameOverModal({ gameEnd, onPlayAgain }) {
  return (
    <motion.div
      className="overlay"
      onClick={onPlayAgain}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="modal"
        role="dialog"
        aria-modal="true"
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
        <h2 className="modal-title">
          {gameEnd.winner ? `${gameEnd.winner} wins` : 'Draw'}
        </h2>
        <p className="modal-sub">
          {gameEnd.type === 'checkmate' ? 'by checkmate'
            : gameEnd.type === 'resign' ? 'by resignation'
            : gameEnd.type === 'timeout' ? 'on time'
            : `by ${gameEnd.reason.toLowerCase()}`}
        </p>
        <button className="btn btn-primary" onClick={onPlayAgain}>Play again</button>
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
