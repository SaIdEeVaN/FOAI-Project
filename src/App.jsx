import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Board, hasThreefoldRepetition } from './engine/board.js';
import { MoveGenerator } from './engine/moveGen.js';
import { uciToSq } from './engine/move.js';
import ChessBoard from './components/ChessBoard.jsx';
import MoveHistory from './components/MoveHistory.jsx';
import EngineConsole from './components/EngineConsole.jsx';
import TeachingMode from './components/TeachingMode.jsx';
import { GameOverModal, PromotionModal } from './components/Modals.jsx';
import { Piece, pieceName } from './components/PieceSymbols.jsx';
import './index.css';

const INITIAL_BOARD = new Board();

// What each side starts with, for the captured-material strip.
const START_COUNTS = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const PIECE_VALUE  = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const CAPTURE_ORDER = ['q', 'r', 'b', 'n', 'p'];

function detectGameEnd(board, positionKeys) {
  const gen = new MoveGenerator(board);
  const legal = gen.generateLegalMoves();
  if (legal.length) {
    if (hasThreefoldRepetition(positionKeys)) return { type: 'draw', reason: 'Threefold Repetition' };
    if (board.halfMoveClock >= 100) return { type: 'draw', reason: '50-Move Rule' };
    const pieces = board.squares.filter(p => p !== '.');
    const types = [...new Set(pieces.map(p => p.toLowerCase()))];
    if (types.every(t => t === 'k') || (pieces.length <= 3 && types.every(t => ['k','b','n'].includes(t)))) {
      return { type: 'draw', reason: 'Insufficient Material' };
    }
    return null;
  }
  if (gen.isInCheck(board.sideToMove)) {
    return { type: 'checkmate', winner: board.sideToMove === 'w' ? 'Black' : 'White' };
  }
  return { type: 'draw', reason: 'Stalemate' };
}

// Pieces of `color` that have left the board, most valuable first, plus their total worth.
function captured(squares, color) {
  const list = [];
  let points = 0;
  for (const type of CAPTURE_ORDER) {
    const piece = color === 'w' ? type.toUpperCase() : type;
    const gone = START_COUNTS[type] - squares.filter(p => p === piece).length;
    for (let i = 0; i < gone; i++) list.push(piece);
    points += Math.max(0, gone) * PIECE_VALUE[type];
  }
  return { list, points };
}

// ── Evaluation bar ──────────────────────────────────────────────────────────
function EvalBar({ score, flip }) {
  const clamped  = Math.max(-800, Math.min(800, score));
  const whitePct = 50 + (clamped / 800) * 50;
  const whiteAhead = score >= 0;
  const label = `${score === 0 ? '0.00' : `${score > 0 ? '+' : '−'}${(Math.abs(score) / 100).toFixed(2)}`} for White`;

  return (
    <div className={`eval-bar${flip ? ' flipped' : ''}`} role="img" aria-label={`Evaluation ${label}`}>
      <div className="eval-bar-white" style={{ height: `${whitePct}%` }} />
      <span className={`eval-bar-score ${whiteAhead ? 'on-white' : 'on-black'}`}>
        {(Math.abs(score) / 100).toFixed(1)}
      </span>
    </div>
  );
}

// ── Player seat ─────────────────────────────────────────────────────────────
function Seat({ name, color, squares, badge }) {
  // A side's advantage is what it took from the other side, minus what it gave up.
  const mine  = captured(squares, color === 'w' ? 'b' : 'w');
  const yours = captured(squares, color);
  const edge  = mine.points - yours.points;

  return (
    <div className="seat">
      <Piece piece={color === 'w' ? 'K' : 'k'} className="seat-pc" />
      <span className="seat-name">{name}</span>
      {mine.list.length > 0 && (
        <span className="seat-taken" aria-label={`Captured: ${mine.list.map(pieceName).join(', ')}`}>
          {mine.list.map((p, i) => <Piece key={i} piece={p} className="taken-pc" />)}
          {edge > 0 && <span className="seat-edge">+{edge}</span>}
        </span>
      )}
      {badge}
    </div>
  );
}

export default function App() {
  const [board]           = useState(() => new Board());
  const [squares, setSquares] = useState([...INITIAL_BOARD.squares]);
  const [sideToMove, setSideToMove] = useState('w');
  const [selectedSq, setSelectedSq] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);
  const [engineThinking, setEngineThinking] = useState(false);
  const [gameEnd, setGameEnd] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [logLines, setLogLines]   = useState([]);
  const [evalScore, setEvalScore] = useState(0);
  const [playerColor, setPlayerColor] = useState('w');
  const [pendingPromotion, setPendingPromotion] = useState(null); // { from, to, color }
  const [view, setView] = useState('play'); // 'play' | 'teach'
  const workerRef = useRef(null);
  const boardRef  = useRef(board);

  // Every position the game has actually stood in, for threefold repetition.
  // A ref, not state: applyEngineResult runs inside the worker's onmessage
  // closure, which is installed once and would capture a stale array.
  const positionsRef = useRef(null);
  if (positionsRef.current === null) positionsRef.current = [board.positionKey()];

  // The worker's onmessage closure is installed once, so anything it reads lives in a ref.
  const playerColorRef = useRef(playerColor);
  useEffect(() => { playerColorRef.current = playerColor; }, [playerColor]);

  // ── Init Web Worker ───────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker(new URL('./engine/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = handleWorkerMsg;
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const handleWorkerMsg = useCallback((e) => {
    const { type, payload } = e.data;
    if (type === 'progress') {
      const line = `d${payload.depth}  score ${(payload.score/100).toFixed(2)}  nodes ${payload.nodes.toLocaleString()}  ${payload.move || ''}`;
      setLogLines(prev => [...prev.slice(-20), line]);
      setTelemetry(payload);
    }
    if (type === 'result') {
      applyEngineResult(payload);
    }
    if (type === 'legalMoves') {
      setLegalTargets(payload.targets);
    }
  }, []);

  // ── Sync board ref ────────────────────────────────────────────────────────
  const syncState = useCallback(() => {
    setSquares([...boardRef.current.squares]);
    setSideToMove(boardRef.current.sideToMove);
  }, []);

  // ── Square click ──────────────────────────────────────────────────────────
  const onSquareClick = useCallback((sq) => {
    if (gameEnd || engineThinking) return;
    if (boardRef.current.sideToMove !== playerColor) return;

    const piece = boardRef.current.squares[sq];

    // If a piece is selected and we click a legal target — make move
    if (selectedSq !== null && legalTargets.includes(sq)) {
      commitPlayerMove(selectedSq, sq);
      return;
    }

    // Select own piece
    if (piece !== '.' && (playerColor === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase())) {
      setSelectedSq(sq);
      setLegalTargets([]);
      // Compute legal moves in worker
      workerRef.current.postMessage({
        type: 'legalMoves',
        payload: { boardState: boardRef.current.serialize(), sq },
      });
      return;
    }

    // Deselect
    setSelectedSq(null);
    setLegalTargets([]);
  }, [selectedSq, legalTargets, gameEnd, engineThinking, playerColor]);

  const commitPlayerMove = (from, to) => {
    const gen = new MoveGenerator(boardRef.current);
    const legal = gen.generateLegalMoves();

    // Check if this move is a promotion
    const isPromotion = legal.some(m => m.startSq === from && m.targetSq === to && m.promotionPiece !== '.');
    if (isPromotion) {
      setPendingPromotion({ from, to, color: boardRef.current.sideToMove });
      return;
    }

    let move = legal.find(m => m.startSq === from && m.targetSq === to);
    if (!move) return;

    _executeMove(move);
  };

  const commitPromotion = (promotionPiece) => {
    const gen = new MoveGenerator(boardRef.current);
    const legal = gen.generateLegalMoves();
    let move = legal.find(m => m.startSq === pendingPromotion.from && m.targetSq === pendingPromotion.to && m.promotionPiece.toLowerCase() === promotionPiece.toLowerCase());

    setPendingPromotion(null);
    if (!move) return;

    _executeMove(move);
  };

  const _executeMove = (move) => {
    boardRef.current.makeMove(move);
    positionsRef.current.push(boardRef.current.positionKey());
    setSelectedSq(null);
    setLegalTargets([]);
    setLastMove({ from: move.startSq, to: move.targetSq });
    setMoveHistory(prev => [...prev, move.toUci()]);
    syncState();

    const end = detectGameEnd(boardRef.current, positionsRef.current);
    if (end) { setGameEnd(end); return; }
  };

  const requestEngine = useCallback(() => {
    setEngineThinking(true);
    workerRef.current.postMessage({
      type: 'search',
      payload: {
        boardState: boardRef.current.serialize(),
        timeLimitMs: 2000,
        positionHistory: positionsRef.current,
      },
    });
  }, []);

  // Auto-trigger engine if it's its turn
  useEffect(() => {
    if (!gameEnd && !engineThinking && sideToMove !== playerColor) {
      requestEngine();
    }
  }, [sideToMove, playerColor, gameEnd, engineThinking, requestEngine]);

  const applyEngineResult = (payload) => {
    setEngineThinking(false);
    if (!payload.uci) return;

    const from = uciToSq(payload.uci.slice(0, 2));
    const to   = uciToSq(payload.uci.slice(2, 4));
    const gen  = new MoveGenerator(boardRef.current);
    const legal = gen.generateLegalMoves();
    const move  = legal.find(m => m.toUci() === payload.uci);
    if (!move) return;

    boardRef.current.makeMove(move);
    positionsRef.current.push(boardRef.current.positionKey());
    setLastMove({ from, to });
    setMoveHistory(prev => [...prev, payload.uci]);
    // The search scores from the mover's point of view; the bar reads from White's.
    setEvalScore(playerColorRef.current === 'w' ? -payload.score : payload.score);
    setTelemetry({ depth: payload.depth, nodes: payload.nodes, score: payload.score, move: payload.uci });
    syncState();

    const end = detectGameEnd(boardRef.current, positionsRef.current);
    if (end) setGameEnd(end);
  };

  const newGame = () => {
    boardRef.current.reset();
    positionsRef.current = [boardRef.current.positionKey()];
    setSquares([...boardRef.current.squares]);
    setSideToMove('w');
    setSelectedSq(null);
    setLegalTargets([]);
    setLastMove(null);
    setMoveHistory([]);
    setGameEnd(null);
    setTelemetry(null);
    setLogLines([]);
    setEvalScore(0);
    setEngineThinking(false);
  };

  const undoMove = () => {
    if (engineThinking || !moveHistory.length) return;
    // Undo 2 half-moves (engine + player) or 1 if only 1 played
    const count = Math.min(2, moveHistory.length);
    for (let i = 0; i < count; i++) {
      if (boardRef.current.history.length) boardRef.current.history.pop();
    }
    // Simplest approach: reset and replay
    const replayMoves = moveHistory.slice(0, -count);
    boardRef.current.reset();
    const keys = [boardRef.current.positionKey()];
    for (const uci of replayMoves) {
      const legal = new MoveGenerator(boardRef.current).generateLegalMoves();
      const move = legal.find(m => m.toUci() === uci);
      if (move) {
        boardRef.current.makeMove(move);
        keys.push(boardRef.current.positionKey());
      }
    }
    positionsRef.current = keys;
    setMoveHistory(replayMoves);
    setLastMove(replayMoves.length ? { from: uciToSq(replayMoves.at(-1).slice(0,2)), to: uciToSq(replayMoves.at(-1).slice(2,4)) } : null);
    setSelectedSq(null);
    setLegalTargets([]);
    setGameEnd(null);
    syncState();
  };

  // ── Status text ───────────────────────────────────────────────────────────
  let statusText;
  if (gameEnd) {
    statusText = gameEnd.type === 'checkmate'
      ? `Checkmate — ${gameEnd.winner} wins`
      : `Draw — ${gameEnd.reason}`;
  } else if (engineThinking || sideToMove !== playerColor) {
    statusText = 'Engine thinking…';
  } else {
    statusText = 'Your turn';
  }

  const inCheck = !gameEnd && new MoveGenerator(boardRef.current).isInCheck(sideToMove);
  const kingSq  = inCheck ? boardRef.current.squares.findIndex(p => p === (sideToMove === 'w' ? 'K' : 'k')) : -1;
  const engineColor = playerColor === 'w' ? 'b' : 'w';
  const flip = playerColor === 'b';

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <motion.span
            className="logo-mark"
            animate={{ y: [0, -5, 0], rotate: [0, -7, 7, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Piece piece="P" />
          </motion.span>
          <div>
            <h1 className="site-title">FOAI Chess Engine</h1>
            <p className="site-sub">Foundations of Artificial Intelligence</p>
          </div>
        </div>

        <nav className="view-tabs" role="tablist" aria-label="Screen">
          <button type="button" role="tab" className="view-tab" aria-selected={view === 'play'}
            onClick={() => setView('play')}>Play</button>
          <button type="button" role="tab" className="view-tab" aria-selected={view === 'teach'}
            onClick={() => setView('teach')}>Teaching mode</button>
        </nav>

        <div className="header-tags">
          <span className="tag">Minimax</span>
          <span className="tag">Alpha-Beta</span>
          <span className="tag">Iterative Deepening</span>
        </div>
      </header>

      {view === 'teach' ? (
        <TeachingMode
          boardState={boardRef.current.serialize()}
          lastMove={lastMove}
          flip={flip}
        />
      ) : (
      <main className="layout">
        {/* Left — board */}
        <section className="board-section">
          <Seat
            name={`Engine (${engineColor === 'w' ? 'White' : 'Black'})`}
            color={engineColor}
            squares={squares}
            badge={engineThinking ? <span className="badge searching">thinking…</span> : null}
          />

          <div className="board-stage">
            <EvalBar score={evalScore} flip={flip} />
            <ChessBoard
              squares={squares}
              selectedSq={selectedSq}
              legalTargets={legalTargets}
              lastMove={lastMove}
              checkSq={kingSq}
              onSquareClick={onSquareClick}
              flip={flip}
            />
          </div>

          <Seat
            name={`You (${playerColor === 'w' ? 'White' : 'Black'})`}
            color={playerColor}
            squares={squares}
            badge={
              <span className={`badge status${gameEnd ? ' ended' : sideToMove === playerColor ? ' active' : ''}`}>
                {statusText}
              </span>
            }
          />

          <div className="controls">
            <button className="btn btn-ghost" onClick={newGame}>New game</button>
            <button className="btn btn-ghost" onClick={undoMove} disabled={engineThinking || !moveHistory.length}>Undo</button>
            <button
              className="btn btn-primary"
              onClick={() => setPlayerColor(c => c === 'w' ? 'b' : 'w')}
              disabled={engineThinking || (moveHistory.length > 0 && !gameEnd)}
              title={(moveHistory.length > 0 && !gameEnd) ? 'Flip board is only available before a game starts or after it ends' : undefined}
            >
              Flip board
            </button>
          </div>
        </section>

        {/* Right — info */}
        <section className="info-section">
          <MoveHistory moves={moveHistory} />
          <EngineConsole
            telemetry={telemetry}
            logLines={logLines}
            evalScore={evalScore}
            thinking={engineThinking}
          />
        </section>
      </main>
      )}

      <AnimatePresence>
        {gameEnd && view === 'play' && (
          <GameOverModal gameEnd={gameEnd} onPlayAgain={newGame} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingPromotion && (
          <PromotionModal
            color={pendingPromotion.color}
            onPick={commitPromotion}
            onCancel={() => { setPendingPromotion(null); setSelectedSq(null); setLegalTargets([]); }}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
