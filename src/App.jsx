import { useState, useEffect, useRef, useCallback } from 'react';
import { Board } from './engine/board.js';
import { MoveGenerator } from './engine/moveGen.js';
import { Move, uciToSq } from './engine/move.js';
import ChessBoard from './components/ChessBoard.jsx';
import MoveHistory from './components/MoveHistory.jsx';
import EngineConsole from './components/EngineConsole.jsx';
import './index.css';

const INITIAL_BOARD = new Board();

function detectGameEnd(board) {
  const gen = new MoveGenerator(board);
  const legal = gen.generateLegalMoves();
  if (legal.length) {
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
  const workerRef = useRef(null);
  const boardRef  = useRef(board);

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
    // Handle promotion — default to queen
    let move = legal.find(m => m.startSq === from && m.targetSq === to && (m.promotionPiece === '.' || m.promotionPiece.toLowerCase() === 'q'));
    if (!move) return;

    boardRef.current.makeMove(move);
    setSelectedSq(null);
    setLegalTargets([]);
    setLastMove({ from, to });
    setMoveHistory(prev => [...prev, move.toUci()]);
    syncState();

    const end = detectGameEnd(boardRef.current);
    if (end) { setGameEnd(end); return; }
  };

  const requestEngine = useCallback(() => {
    setEngineThinking(true);
    workerRef.current.postMessage({
      type: 'search',
      payload: { boardState: boardRef.current.serialize(), timeLimitMs: 2000 },
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
    setLastMove({ from, to });
    setMoveHistory(prev => [...prev, payload.uci]);
    setEvalScore(-payload.score); // Negate — engine played Black, positive = good for engine = bad for White
    setTelemetry({ depth: payload.depth, nodes: payload.nodes, score: payload.score, move: payload.uci });
    syncState();

    const end = detectGameEnd(boardRef.current);
    if (end) setGameEnd(end);
  };

  const newGame = () => {
    boardRef.current.reset();
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
    const gen = new MoveGenerator(boardRef.current);
    for (const uci of replayMoves) {
      const legal = new MoveGenerator(boardRef.current).generateLegalMoves();
      const move = legal.find(m => m.toUci() === uci);
      if (move) boardRef.current.makeMove(move);
    }
    setMoveHistory(replayMoves);
    setLastMove(replayMoves.length >= 2 ? { from: uciToSq(replayMoves.at(-1).slice(0,2)), to: uciToSq(replayMoves.at(-1).slice(2,4)) } : null);
    setSelectedSq(null);
    setLegalTargets([]);
    setGameEnd(null);
    syncState();
  };

  // ── Status text ───────────────────────────────────────────────────────────
  let statusText = sideToMove === 'w' ? 'Your turn' : 'Engine thinking…';
  if (engineThinking) statusText = 'Engine thinking…';
  if (gameEnd) {
    statusText = gameEnd.type === 'checkmate'
      ? `Checkmate — ${gameEnd.winner} wins`
      : `Draw — ${gameEnd.reason}`;
  }

  const inCheck = !gameEnd && new MoveGenerator(board).isInCheck(sideToMove);
  const kingSq  = inCheck ? board.squares.findIndex(p => p === (sideToMove === 'w' ? 'K' : 'k')) : -1;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo-mark">♟</span>
          <div>
            <h1 className="site-title">FOAI Chess Engine</h1>
            <p className="site-sub">Foundations of Artificial Intelligence</p>
          </div>
        </div>
        <div className="header-pills">
          <span className="pill">Minimax</span>
          <span className="pill">Alpha-Beta</span>
          <span className="pill">Iterative Deepening</span>
        </div>
      </header>

      <main className="layout">
        {/* Left — board */}
        <section className="board-section">
          <div className="player-tag top">
            <span className={`player-dot ${playerColor === 'w' ? 'black' : 'white'}`} />
            <span>Engine ({playerColor === 'w' ? 'Black' : 'White'})</span>
            {engineThinking && <span className="thinking-badge">thinking…</span>}
          </div>

          <ChessBoard
            squares={squares}
            selectedSq={selectedSq}
            legalTargets={legalTargets}
            lastMove={lastMove}
            checkSq={kingSq}
            onSquareClick={onSquareClick}
            flip={playerColor === 'b'}
          />

          <div className="player-tag bottom">
            <span className={`player-dot ${playerColor === 'w' ? 'white' : 'black'}`} />
            <span>You ({playerColor === 'w' ? 'White' : 'Black'})</span>
            <span className={`status-badge ${gameEnd ? 'ended' : sideToMove === playerColor ? 'active' : ''}`}>
              {statusText}
            </span>
          </div>

          <div className="controls">
            <button className="btn btn-ghost" onClick={newGame}>New Game</button>
            <button className="btn btn-ghost" onClick={undoMove} disabled={engineThinking || !moveHistory.length}>Undo</button>
            <button className="btn btn-primary" onClick={() => setPlayerColor(c => c === 'w' ? 'b' : 'w')} disabled={engineThinking}>
              Flip Board
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

      {gameEnd && (
        <div className="overlay" onClick={newGame}>
          <div className="overlay-card" onClick={e => e.stopPropagation()}>
            <p className="overlay-eyebrow">Game Over</p>
            <h2 className="overlay-title">
              {gameEnd.type === 'checkmate' ? `${gameEnd.winner} wins` : 'Draw'}
            </h2>
            <p className="overlay-reason">
              {gameEnd.type === 'checkmate' ? 'by Checkmate' : `by ${gameEnd.reason}`}
            </p>
            <button className="btn btn-primary" onClick={newGame}>Play Again</button>
          </div>
        </div>
      )}
    </div>
  );
}
