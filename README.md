# ♟ FOAI Chess Engine

A browser-based chess game built with **React + Vite** as part of the *Foundations of Artificial Intelligence* course project.

The AI opponent runs entirely in the browser using a custom chess engine with:
- **Minimax** search with **Alpha-Beta pruning**
- **MVV-LVA move ordering** and a **fixed-size, Zobrist-hashed transposition table**
- **Null-move pruning** and a configurable **contempt** for draws
- **Iterative Deepening** for time-controlled play
- A Web Worker so the UI stays responsive while the engine thinks

The final report, with the experiments and the playing-strength benchmark, is in [`REPORT.md`](REPORT.md).

---

## Features

| Feature | Details |
|---|---|
| Play vs AI | Every match opens with a *New game* dialog: pick the time control, your side (White, Black or Random) and the engine's contempt before the first move |
| Time controls | Bullet (1+0, 2+1), Blitz (3+0, 3+2, 5+0), Rapid (10+0, 15+10) or no clock, fixed for the whole match. Clocks start once both sides have moved, the engine budgets its thinking time from its clock, and running out loses on time. No takebacks in timed games |
| Premoves | Queue a move while the engine thinks; it plays the instant the engine replies, if still legal. Click or right-click to cancel |
| Legal move hints | Click a piece to see valid squares |
| Typed moves | Type a move in SAN (`e4`, `Nf3`, `exd5`, `O-O`, `e8=Q`) or UCI (`e2e4`) under the board; an illegal or ambiguous move says why |
| Contempt | From −100 (seeks draws) to +100 centipawns (avoids draws); a draw is worth −contempt to the engine |
| Game over | The result card goes back to the board with the finished game on it; *New game* is there when you want it |
| Last-move highlight | The previous move is highlighted on the board |
| Check indicator | The king square turns red when in check |
| Evaluation bar | Live centipawn score from the engine, flipping with the board |
| Captured material | Each seat shows what it has taken and by how many points it leads |
| Engine telemetry | Depth, nodes searched, best move log (in SAN), and how full the transposition table is |
| Move history | Full game record in Standard Algebraic Notation |
| Undo | Take back the last pair of moves |
| Teaching mode | Searches the current position — or any position you paste as FEN, or one of five sharp presets — three ways at a fixed depth and compares node counts |

---

## Teaching Mode

The **Teaching mode** tab snapshots the position on the board and searches it three times at a
fixed depth of 5 — once with plain minimax, once with alpha-beta, and once with whichever
techniques are switched on in the pill row. All three usually return the same move; what changes
is how much work it took, which is the point of the screen.

Measured on the starting position (Node 22, one core):

| Configuration | Nodes | Time | Relative |
|---|---|---|---|
| Plain Minimax | 5,072,213 | 15.0s | baseline |
| + Alpha-Beta | 113,360 | 0.42s | 45× fewer |
| + MVV-LVA + TT | 58,390 | 0.28s | 87× fewer |

Fewer nodes is not automatically less time: sorting the moves costs about 40% of the speed per
node. It pays anyway, because it saves far more nodes than that. [`REPORT.md`](REPORT.md) repeats this comparison over 17 positions and depths 1–7.

The plain node count is exactly `perft(0) + … + perft(5)`, which is a useful correctness check on
the move generator. Searches run one at a time in a dedicated Web Worker, and each result appears
as soon as it lands. Finished searches are cached, so toggling a technique only re-runs what changed.
A search that passes 60 seconds stops and reports its node count as a lower bound (`≥`), which is
what a busy middlegame position does to plain minimax.

Quiescence and null-move pruning both depend on the alpha-beta window, so they switch off with it —
without pruning, a capture search has nothing to cut and grows without bound.

The position need not be the game's. The **Position** row loads any FEN (a bad one is explained:
wrong rank lengths, missing kings, castling rights with no rook at home, the side not to move in
check…) or one of five presets: the Opera Game mate in two, Win at Chess #1 and #4, the perft rook
endgame and Kiwipete. *Current game* goes back to the snapshot.

---

## Interface

Both screens are built from one set of design tokens and primitives in `src/index.css` — the same
cards, uppercase micro-labels, monospace numerals and accent bars appear on the play board and in
teaching mode.

Every piece on either board is drawn from the SVG symbol set in `src/components/PieceSymbols.jsx`,
never from a font glyph. The Unicode chess characters (`♙`–`♟`) carry emoji presentation in several
system fonts, and a colour font ignores `color` and `-webkit-text-fill-color`, so white pieces —
pawns in particular — were painted black by the OS on the machines that shipped such a font. An SVG
`fill` has no such opinion, so the pieces look identical everywhere.

---

## Tech Stack

- **React 19** + **Vite 8**
- Vanilla CSS (no UI library)
- Custom chess engine (TypeScript compiled to JS)
- Web Workers for off-thread engine search
- Firebase Hosting for deployment

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Production build
npm run build

# Preview production build locally
npm run preview

# Automated tests (perft on the standard positions, FEN, SAN, search, TT, teaching search)
npm test
# …with every published perft depth, up to 4.9M leaves (~15 s)
npm run test:deep
```

CI runs `npm test` before every build, so a failing test stops a deploy.

---

## Benchmarks

The `bench/` scripts run in Node and are not part of the site. Matches against Stockfish need it
installed for the run (it is ~100 MB, so it is not a dependency):

```bash
npm install --no-save stockfish

# Elo estimate: fixed time per move against Stockfish at calibrated strengths
node bench/match.js --player foai --opponents sf:1500,sf:1700,sf:1900,sf:2100 --movetime 1000 --rounds 16

# Self-play A/B, e.g. null-move on vs off
node bench/match.js --player foai --opponents foai:nullMove=false --movetime 300

# Teaching-search experiments over 17 positions and depths 1–7, then the report tables
node bench/experiments.js --max-depth 7 --limit 30
node bench/tables.js

# The 105-position tactical suite, and transposition-table sizing
node bench/suite.js --engine foai --movetime 1000
node bench/tt-size.js
```

Results, games (PGN) and the tactical suite are in `bench/results/` and `bench/positions/`;
[`REPORT.md`](REPORT.md) discusses them.

---

## Project Structure

```
chess_react/
├── src/
│   ├── components/
│   │   ├── ChessBoard.jsx      # Board rendering + square interaction
│   │   ├── MoveHistory.jsx     # Move list panel
│   │   ├── EngineConsole.jsx   # Eval bar + engine telemetry
│   │   ├── TeachingMode.jsx    # Search comparison screen
│   │   ├── MoveEntry.jsx       # Typed move box (SAN or UCI)
│   │   ├── TimeControl.jsx     # Clocks, time controls, match summary
│   │   ├── Modals.jsx          # New-game, game-over and promotion dialogs
│   │   └── PieceSymbols.jsx    # SVG piece symbol set (#pc-p … #pc-k)
│   ├── engine/
│   │   ├── board.js            # Board state, move making, FEN in and out
│   │   ├── moveGen.js          # Legal move generation
│   │   ├── move.js             # Move encoding/decoding
│   │   ├── san.js              # SAN: writing moves, and reading typed ones
│   │   ├── fen.js              # FEN validation with plain-language errors
│   │   ├── evaluation.js       # Static evaluation + per-term breakdown
│   │   ├── search.js           # Iterative deepening, null-move, contempt (game play)
│   │   ├── teachingSearch.js   # Fixed-depth search with switchable techniques
│   │   ├── transposition.js    # Zobrist hashing + fixed-size transposition table
│   │   ├── premove.js          # Premove target squares
│   │   └── worker.js           # Web Worker entry point (search + teaching runs)
│   ├── App.jsx                 # Root component + game logic
│   ├── index.css               # Design tokens, shared primitives, both screens
│   └── main.jsx                # React entry point
├── test/                       # npm test — node:test suite
├── bench/                      # Matches, Elo, experiments, tactical suite (Node only)
│   ├── positions/tactics.epd   # 105 Stockfish-verified positions with one best move
│   └── results/                # Raw results behind REPORT.md
├── public/
├── index.html
├── vite.config.js
├── firebase.json               # Firebase Hosting config
└── .firebaserc                 # Firebase project alias
```

---

## Deployment

See the **Firebase + GitHub Actions CI/CD guide** in `DEPLOY_GUIDE.md` for step-by-step hosting and automation instructions.

---

## License

MIT — free to use, modify, and distribute.
