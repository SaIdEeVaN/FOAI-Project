# ♟ FOAI Chess Engine

A browser-based chess game built with **React + Vite** as part of the *Foundations of Artificial Intelligence* course project.

The AI opponent runs entirely in the browser using a custom chess engine with:
- **Minimax** search with **Alpha-Beta pruning**
- **MVV-LVA move ordering** and a **Zobrist-hashed transposition table**
- **Iterative Deepening** for time-controlled play
- A Web Worker so the UI stays responsive while the engine thinks

---

## Features

| Feature | Details |
|---|---|
| Play vs AI | Each game puts you on a random side; *Play as White/Black* restarts on the other side until you have moved |
| Time controls | Bullet (1+0, 2+1), Blitz (3+0, 3+2, 5+0), Rapid (10+0, 15+10) or no clock. Clocks start once both sides have moved, the engine budgets its thinking time from its clock, and running out loses on time. No takebacks in timed games |
| Premoves | Queue a move while the engine thinks; it plays the instant the engine replies, if still legal. Click or right-click to cancel |
| Legal move hints | Click a piece to see valid squares |
| Last-move highlight | The previous move is highlighted on the board |
| Check indicator | The king square turns red when in check |
| Evaluation bar | Live centipawn score from the engine, flipping with the board |
| Captured material | Each seat shows what it has taken and by how many points it leads |
| Engine telemetry | Depth, nodes searched, best move log |
| Move history | Full game record in algebraic notation |
| Undo | Take back the last pair of moves |
| Teaching mode | Searches the current position three ways at a fixed depth and compares node counts |

---

## Teaching Mode

The **Teaching mode** tab snapshots the position on the board and searches it three times at a
fixed depth of 5 — once with plain minimax, once with alpha-beta, and once with whichever
techniques are switched on in the pill row. All three usually return the same move; what changes
is how much work it took, which is the point of the screen.

Measured on the starting position (Node 24, one core):

| Configuration | Nodes | Time | Relative |
|---|---|---|---|
| Plain Minimax | 5,072,213 | 13.6s | baseline |
| + Alpha-Beta | 113,360 | 0.69s | 45× fewer |
| + MVV-LVA + TT | 58,356 | 0.77s | 87× fewer |

Note that the third configuration searches half as many nodes as the second but takes slightly
longer: every node it visits pays for a Zobrist hash. Fewer nodes is not automatically less time.

The plain node count is exactly `perft(0) + … + perft(5)`, which is a useful correctness check on
the move generator. Searches run one at a time in a dedicated Web Worker, and each result appears
as soon as it lands. Finished searches are cached, so toggling a technique only re-runs what changed.
A search that passes 60 seconds stops and reports its node count as a lower bound (`≥`), which is
what a busy middlegame position does to plain minimax.

Quiescence and null-move pruning both depend on the alpha-beta window, so they switch off with it —
without pruning, a capture search has nothing to cut and grows without bound.

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
```

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
│   │   ├── Modals.jsx          # Game-over and promotion dialogs
│   │   └── PieceSymbols.jsx    # SVG piece symbol set (#pc-p … #pc-k)
│   ├── engine/
│   │   ├── board.js            # Board state + move making
│   │   ├── moveGen.js          # Legal move generation
│   │   ├── move.js             # Move encoding/decoding
│   │   ├── evaluation.js       # Static evaluation + per-term breakdown
│   │   ├── search.js           # Iterative deepening search (game play)
│   │   ├── teachingSearch.js   # Fixed-depth search with switchable techniques
│   │   ├── transposition.js    # Zobrist hashing + transposition table
│   │   └── worker.js           # Web Worker entry point (search + teaching runs)
│   ├── App.jsx                 # Root component + game logic
│   ├── index.css               # Design tokens, shared primitives, both screens
│   └── main.jsx                # React entry point
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
