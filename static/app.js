/**
 * Module 5: Interactive Visual Interface — app.js
 * Handles board rendering, player interaction, and API communication.
 */

"use strict";
const API = "http://127.0.0.1:5000/api";

// ── Unicode piece map ──────────────────────────────────────────────────────
const PIECE_UNICODE = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  squares:       Array(64).fill("."),
  side_to_move:  "w",
  move_history:  [],
  game_over:     false,
  half_move_clock: 0,
  full_move_number: 1,
};
let selectedSq   = null;
let legalTargets = [];
let lastMove     = null;   // { from, to }
let gameMode     = "human"; // "human" | "ai"
let engineThinking = false;

// ── Boot ───────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  buildCoords();
  newGame();
});

// ── Coordinate labels ──────────────────────────────────────────────────────
function buildCoords() {
  const ranks = document.getElementById("rankLabels");
  const files = document.getElementById("fileLabels");
  for (let r = 8; r >= 1; r--) {
    const el = document.createElement("span");
    el.textContent = r;
    ranks.appendChild(el);
  }
  "abcdefgh".split("").forEach(f => {
    const el = document.createElement("span");
    el.textContent = f;
    files.appendChild(el);
  });
}

// ── API helpers ────────────────────────────────────────────────────────────
async function apiFetch(path, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  return res.json();
}

// ── New game ───────────────────────────────────────────────────────────────
async function newGame() {
  selectedSq = null;
  legalTargets = [];
  lastMove = null;
  clearLog();
  hideOverlay();
  const data = await apiFetch("/new_game", "POST");
  updateState(data.board_state);
  logLine("New game started. Engine plays Black.", "result-line");
}

// ── Mode toggle ────────────────────────────────────────────────────────────
function setMode(mode) {
  gameMode = mode;
  document.getElementById("modeHuman").classList.toggle("active", mode === "human");
  document.getElementById("modeAI").classList.toggle("active", mode === "ai");
  if (mode === "ai") {
    updateStatus("AI vs AI — watching…");
    runAIvsAI();
  }
}

async function runAIvsAI() {
  if (gameMode !== "ai" || state.game_over) return;
  await triggerEngineMove();
  if (!state.game_over && gameMode === "ai") {
    setTimeout(runAIvsAI, 600);
  }
}

// ── Board rendering ────────────────────────────────────────────────────────
function renderBoard() {
  const board = document.getElementById("chessBoard");
  board.innerHTML = "";

  for (let sq = 0; sq < 64; sq++) {
    const rank = Math.floor(sq / 8);
    const file = sq % 8;
    const isLight = (rank + file) % 2 === 0;

    const div = document.createElement("div");
    div.classList.add("square", isLight ? "light" : "dark");
    div.id = `sq-${sq}`;
    div.dataset.sq = sq;

    // Highlights
    if (selectedSq === sq) div.classList.add("selected");
    if (lastMove && lastMove.from === sq) div.classList.add("last-from");
    if (lastMove && lastMove.to === sq)   div.classList.add("last-to");

    // Legal move dots / rings
    if (legalTargets.includes(sq)) {
      const hasPiece = state.squares[sq] !== ".";
      div.classList.add(hasPiece ? "legal-capture" : "legal-move");
    }

    // King in check highlight
    if (state.in_check && sq === findKingSq(state.side_to_move)) {
      div.classList.add("in-check");
    }

    // Piece
    const piece = state.squares[sq];
    if (piece !== ".") {
      const span = document.createElement("span");
      span.classList.add("piece");
      span.textContent = PIECE_UNICODE[piece] || piece;
      div.appendChild(span);
    }

    div.addEventListener("click", () => onSquareClick(sq));
    board.appendChild(div);
  }
}

// ── Square click logic ─────────────────────────────────────────────────────
async function onSquareClick(sq) {
  if (state.game_over || engineThinking) return;
  if (gameMode === "ai") return;

  // If it's the engine's turn (Black), ignore
  if (state.side_to_move === "b") return;

  const piece = state.squares[sq];

  // If a piece is already selected
  if (selectedSq !== null) {
    // Clicking on a legal target → make the move
    if (legalTargets.includes(sq)) {
      await makePlayerMove(selectedSq, sq);
      return;
    }
    // Clicking own piece → re-select
    if (piece !== "." && isOwnPiece(piece, state.side_to_move)) {
      await selectSquare(sq);
      return;
    }
    // Clicking elsewhere → deselect
    deselect();
    renderBoard();
    return;
  }

  // Select a piece
  if (piece !== "." && isOwnPiece(piece, state.side_to_move)) {
    await selectSquare(sq);
  }
}

async function selectSquare(sq) {
  selectedSq = sq;
  const data = await apiFetch(`/legal_moves/${sq}`);
  legalTargets = data.targets || [];
  renderBoard();
}

function deselect() {
  selectedSq = null;
  legalTargets = [];
}

function isOwnPiece(piece, side) {
  return side === "w" ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
}

function findKingSq(side) {
  const king = side === "w" ? "K" : "k";
  return state.squares.indexOf(king);
}

// ── Make player move ───────────────────────────────────────────────────────
async function makePlayerMove(from, to) {
  // Handle pawn promotion — default to queen
  let uci = sqToAlg(from) + sqToAlg(to);
  const piece = state.squares[from];
  const isPromo = (piece === "P" && Math.floor(to / 8) === 0) ||
                  (piece === "p" && Math.floor(to / 8) === 7);
  if (isPromo) uci += "q";

  deselect();
  const data = await apiFetch("/player_move", "POST", { uci });
  if (!data.ok) {
    console.error("Invalid move:", data.error);
    renderBoard();
    return;
  }
  lastMove = { from, to };
  updateState(data.board_state);
  handleStatus(data.status);

  // Trigger engine response
  if (!state.game_over && state.side_to_move === "b") {
    await triggerEngineMove();
  }
}

// ── Engine move ────────────────────────────────────────────────────────────
async function requestEngineMove() {
  if (state.game_over || engineThinking) return;
  await triggerEngineMove();
}

async function triggerEngineMove() {
  engineThinking = true;
  showSpinner(true);
  setEngineDot(true);

  const data = await apiFetch("/engine_move", "POST", { time_limit: 2.0 });

  showSpinner(false);
  setEngineDot(false);
  engineThinking = false;

  if (!data.ok) {
    handleStatus(data.status);
    return;
  }

  const uciStr = data.move;
  const from = algToSq(uciStr.slice(0, 2));
  const to   = algToSq(uciStr.slice(2, 4));
  lastMove = { from, to };

  updateState(data.board_state);
  updateTelemetry(data.telemetry);
  handleStatus(data.status);
}

async function undoMove() {
  if (engineThinking) return;
  const data = await apiFetch("/undo", "POST");
  if (data.ok) {
    lastMove = null;
    deselect();
    updateState(data.board_state);
    updateStatus("Move undone.");
  }
}

// ── State update ───────────────────────────────────────────────────────────
function updateState(bs) {
  state = { ...state, ...bs };
  renderBoard();
  renderMoveHistory(bs.move_history || []);
  updateStatusFromState();
  updateEvalBar(0); // Reset until engine gives a score

  document.getElementById("teleHalfMove").textContent = bs.half_move_clock ?? "—";
  document.getElementById("teleMoveNum").textContent   = bs.full_move_number ?? "—";
}

function updateStatusFromState() {
  if (state.game_over) return;
  const side = state.side_to_move === "w" ? "White" : "Black";
  if (gameMode === "human") {
    updateStatus(state.side_to_move === "w" ? "White to move — Your turn!" : "Black to move — Engine thinking…");
  } else {
    updateStatus(`${side} to move — AI vs AI`);
  }
  // Check indicator
  const banner = document.getElementById("statusBanner");
  banner.classList.remove("check", "ended");
  if (state.in_check) banner.classList.add("check");
}

function updateStatus(msg) {
  document.getElementById("statusText").textContent = msg;
}

function handleStatus(status) {
  if (!status || status.type === "ongoing") return;

  const overlay = document.getElementById("gameOverOverlay");
  const title   = document.getElementById("overlayTitle");
  const msg     = document.getElementById("overlayMsg");
  const icon    = document.getElementById("overlayIcon");
  const banner  = document.getElementById("statusBanner");

  banner.classList.add("ended");
  banner.classList.remove("check");

  if (status.type === "checkmate") {
    icon.textContent  = "♚";
    title.textContent = "Checkmate!";
    msg.textContent   = `${status.winner} wins. (${status.result})`;
    updateStatus(`Checkmate! ${status.winner} wins.`);
  } else if (status.type === "stalemate") {
    icon.textContent  = "🤝";
    title.textContent = "Stalemate!";
    msg.textContent   = "It's a draw. (½–½)";
    updateStatus("Stalemate! It's a draw.");
  } else if (status.type === "fifty_move_rule") {
    icon.textContent  = "⏱";
    title.textContent = "Draw!";
    msg.textContent   = "50-move rule. (½–½)";
    updateStatus("Draw by 50-move rule.");
  } else if (status.type === "insufficient_material") {
    icon.textContent  = "🤝";
    title.textContent = "Draw!";
    msg.textContent   = "Insufficient material. (½–½)";
    updateStatus("Draw by insufficient material.");
  }

  overlay.classList.remove("hidden");
}

// ── Telemetry ──────────────────────────────────────────────────────────────
function updateTelemetry(t) {
  if (!t) return;
  document.getElementById("teleBestMove").textContent = t.move_played ?? "—";
  document.getElementById("teleDepth").textContent    = t.depth_searched ?? "—";
  document.getElementById("teleNodes").textContent    = (t.nodes_expanded ?? 0).toLocaleString();
  document.getElementById("teleMoveNum").textContent  = t.move_number ?? "—";

  const rawScore = t.evaluation_score ?? 0;
  const displayScore = (rawScore / 100).toFixed(2);
  const sign = rawScore > 0 ? "+" : "";
  document.getElementById("teleEval").textContent = `${sign}${displayScore}`;
  document.getElementById("teleEval").style.color =
    rawScore > 50 ? "var(--text-primary)" : rawScore < -50 ? "#f88" : "var(--text-sec)";

  updateEvalBar(rawScore);

  // Add log lines
  logLine(`▶ Depth ${t.depth_searched} | Nodes: ${t.nodes_expanded.toLocaleString()} | Score: ${sign}${displayScore}`, "depth-line");
  logLine(`  Best Move: ${t.move_played} (Move ${t.move_number})`, "result-line");
}

function updateEvalBar(rawScore) {
  // rawScore in centipawns from White's perspective
  const clamped = Math.max(-1000, Math.min(1000, rawScore));
  const whitePct = 50 + (clamped / 1000) * 50;
  const blackPct = 100 - whitePct;
  document.getElementById("evalBarWhite").style.width = whitePct + "%";
  document.getElementById("evalBarBlack").style.width = blackPct + "%";
}

// ── Move History rendering ─────────────────────────────────────────────────
function renderMoveHistory(history) {
  const container = document.getElementById("moveHistory");
  if (!history.length) {
    container.innerHTML = `<p class="muted-text" style="grid-column:1/-1">No moves yet…</p>`;
    return;
  }
  container.innerHTML = "";
  for (let i = 0; i < history.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const wMove   = history[i];
    const bMove   = history[i + 1] || "";
    const isLatestW = i === history.length - 1;
    const isLatestB = i + 1 === history.length - 1;

    const numEl = document.createElement("span");
    numEl.className = "move-num";
    numEl.textContent = moveNum + ".";

    const wEl = document.createElement("span");
    wEl.className = `move-cell white-move${isLatestW ? " latest" : ""}`;
    wEl.textContent = wMove;

    const bEl = document.createElement("span");
    bEl.className = `move-cell black-move${isLatestB ? " latest" : ""}`;
    bEl.textContent = bMove;

    container.appendChild(numEl);
    container.appendChild(wEl);
    container.appendChild(bEl);
  }
  container.scrollTop = container.scrollHeight;
}

// ── Log ────────────────────────────────────────────────────────────────────
function logLine(text, cls = "") {
  const log = document.getElementById("engineLog");
  const p = document.createElement("p");
  p.className = `log-line ${cls}`;
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}
function clearLog() {
  const log = document.getElementById("engineLog");
  log.innerHTML = `<p class="log-line muted-text">Awaiting first engine move…</p>`;
}

// ── UI helpers ─────────────────────────────────────────────────────────────
function showSpinner(show) {
  document.getElementById("spinnerOverlay").classList.toggle("hidden", !show);
}
function hideOverlay() {
  document.getElementById("gameOverOverlay").classList.add("hidden");
}
function setEngineDot(thinking) {
  document.getElementById("engineDot").classList.toggle("thinking", thinking);
}

// ── Coordinate helpers ─────────────────────────────────────────────────────
function sqToAlg(sq) {
  const file = String.fromCharCode(97 + (sq % 8));
  const rank = String(8 - Math.floor(sq / 8));
  return file + rank;
}
function algToSq(alg) {
  const file = alg.charCodeAt(0) - 97;
  const rank = 8 - parseInt(alg[1]);
  return rank * 8 + file;
}

// ── Expose functions for HTML onclick attributes ───────────────────────────
window.newGame          = newGame;
window.setMode          = setMode;
window.undoMove         = undoMove;
window.requestEngineMove = requestEngineMove;
