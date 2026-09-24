import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Board, hasThreefoldRepetition } from './engine/board.js';
import { MoveGenerator } from './engine/moveGen.js';
import { Evaluation } from './engine/evaluation.js';
import { uciToSq } from './engine/move.js';
import ChessBoard from './components/ChessBoard.jsx';
import MoveHistory from './components/MoveHistory.jsx';
import EngineConsole from './components/EngineConsole.jsx';
import TeachingMode from './components/TeachingMode.jsx';
import { GameOverModal, PromotionModal } from './components/Modals.jsx';
import { Piece, pieceName } from './components/PieceSymbols.jsx';
import { formatScore, isMate, mateIn, MATE_SCORE } from './components/score.js';
import './index.css';

const INITIAL_BOARD = new Board();
const evaluator = new Evaluation();

// Instant, search-free read of a position, from White's side. It moves the bar the
// moment a piece lands; the engine's deeper scores then refine it as they arrive.
const staticEval = (board) => evaluator.evaluate(board);

// Each game hands the player a random side.
const randomColor = () => (Math.random() < 0.5 ? 'w' : 'b');

// Index of the player's most recent move in the game's move list, or -1. White
// makes the even-numbered half-moves, Black the odd ones.
function lastPlayerMoveIndex(moveCount, playerColor) {
  const parity = playerColor === 'w' ? 0 : 1;
  let i = moveCount - 1;
  if (i >= 0 && i % 2 !== parity) i--;
  return i;
}

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
  const mate = isMate(score);
  const winner = whiteAhead ? 'White' : 'Black';
  const label = mate ? (mateIn(score) ? `${winner} mates in ${mateIn(score)}` : `checkmate, ${winner} wins`)
                     : `${formatScore(score, { sign: true })} for White`;

  return (
    <div className={`eval-bar${flip ? ' flipped' : ''}${mate ? ' mate' : ''}`} role="img" aria-label={`Evaluation: ${label}`}>
      <div className="eval-bar-white" style={{ height: `${whitePct}%` }} />
      <span className={`eval-bar-score ${whiteAhead ? 'on-white' : 'on-black'}`}>
        {formatScore(score, { decimals: 1 })}
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
  const [playerColor, setPlayerColor] = useState(randomColor);
  const [pendingPromotion, setPendingPromotion] = useState(null); // { from, to, color }
  const [view, setView] = useState('play'); // 'play' | 'teach'
  const [confirmResign, setConfirmResign] = useState(false);
  const workerRef = useRef(null);
  // Id of the search whose messages still count. Resigning or starting a new game
  // bumps it, so a search already running in the worker is ignored when it lands.
  const searchIdRef = useRef(0);
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
    if ((type === 'progress' || type === 'result') && payload.id !== searchIdRef.current) return;
    if (type === 'progress') {
      const line = `d${payload.depth}  score ${formatScore(payload.score, { sign: true })}  nodes ${payload.nodes.toLocaleString()}  ${payload.move || ''}`;
      setLogLines(prev => [...prev.slice(-20), line]);
      setTelemetry(payload);
      // Live bar: each finished iteration is the engine's current opinion.
      // The search scores from the mover's (engine's) side; the bar reads from White's.
      setEvalScore(playerColorRef.current === 'w' ? -payload.score : payload.score);
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
    setEvalScore(staticEval(boardRef.current));
    setConfirmResign(false);
    syncState();

    const end = detectGameEnd(boardRef.current, positionsRef.current);
    if (end) { endGame(end); return; }
  };

  const requestEngine = useCallback(() => {
    setEngineThinking(true);
    const id = ++searchIdRef.current;
    workerRef.current.postMessage({
      type: 'search',
      payload: {
        id,
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
    // A mate is one ply closer once the engine's move is on the board.
    const score = isMate(payload.score) ? payload.score + Math.sign(payload.score) : payload.score;
    setEvalScore(playerColorRef.current === 'w' ? -score : score);
    setTelemetry({ depth: payload.depth, nodes: payload.nodes, score: payload.score, move: payload.uci });
    syncState();

    const end = detectGameEnd(boardRef.current, positionsRef.current);
    if (end) endGame(end);
  };

  // Checkmate pins the bar to the winner and labels it "#".
  const endGame = (end) => {
    setGameEnd(end);
    if (end.type === 'checkmate') setEvalScore(end.winner === 'White' ? MATE_SCORE : -MATE_SCORE);
  };

  // A fresh game, on a random side unless one is asked for.
  const startGame = (color = randomColor()) => {
    searchIdRef.current++;
    setConfirmResign(false);
    setPlayerColor(color);
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

  const newGame = () => startGame();

  const resign = () => {
    if (gameEnd) return;
    if (!confirmResign) { setConfirmResign(true); return; }
    searchIdRef.current++; // Drop any search still running
    setConfirmResign(false);
    setEngineThinking(false);
    setSelectedSq(null);
    setLegalTargets([]);
    setPendingPromotion(null);
    setGameEnd({ type: 'resign', winner: playerColor === 'w' ? 'Black' : 'White' });
  };

  // An unanswered "Confirm resign?" quietly backs out after a few seconds.
  useEffect(() => {
    if (!confirmResign) return;
    const t = setTimeout(() => setConfirmResign(false), 4000);
    return () => clearTimeout(t);
  }, [confirmResign]);

  const undoMove = () => {
    // Take back the player's last move and the engine's reply to it, if any, so it
    // is the player's turn again. Playing Black, the engine's opening move stays.
    const keep = lastPlayerMoveIndex(moveHistory.length, playerColor);
    if (engineThinking || keep < 0) return;
    // Simplest approach: reset and replay
    const replayMoves = moveHistory.slice(0, keep);
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
    setEvalScore(staticEval(boardRef.current));
    syncState();
  };

  // ── Status text ───────────────────────────────────────────────────────────
  let statusText;
  if (gameEnd) {
    statusText = gameEnd.type === 'checkmate' ? `Checkmate — ${gameEnd.winner} wins`
      : gameEnd.type === 'resign' ? `You resigned — ${gameEnd.winner} wins`
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
            <button className="btn btn-ghost" onClick={undoMove}
              disabled={engineThinking || lastPlayerMoveIndex(moveHistory.length, playerColor) < 0}>Undo</button>
            <button
              className={`btn ${confirmResign ? 'btn-danger' : 'btn-ghost'}`}
              onClick={resign}
              disabled={!!gameEnd}
            >
              {confirmResign ? 'Confirm resign?' : 'Resign'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => startGame(engineColor)}
              disabled={!gameEnd && lastPlayerMoveIndex(moveHistory.length, playerColor) >= 0}
              title="Start a new game on the other side"
            >
              Play as {playerColor === 'w' ? 'Black' : 'White'}
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
