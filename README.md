# ♟ FOAI Chess Engine

A browser-based chess game built with **React + Vite** as part of the *Foundations of Artificial Intelligence* course project.

The AI opponent runs entirely in the browser using a custom chess engine with:
- **Minimax** search with **Alpha-Beta pruning**
- **Iterative Deepening** for time-controlled play
- A Web Worker so the UI stays responsive while the engine thinks

---

## Features

| Feature | Details |
|---|---|
| Play vs AI | You play White; the engine plays Black |
| Legal move hints | Click a piece to see valid squares |
| Last-move highlight | The previous move is highlighted on the board |
| Check indicator | The king square turns red when in check |
| Evaluation bar | Live centipawn score from the engine |
| Engine telemetry | Depth, nodes searched, best move log |
| Move history | Full game record in algebraic notation |
| Undo | Take back the last pair of moves |

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
│   │   └── EngineConsole.jsx   # Eval bar + engine telemetry
│   ├── engine/
│   │   ├── board.js            # Board state + move making
│   │   ├── moveGen.js          # Legal move generation
│   │   ├── move.js             # Move encoding/decoding
│   │   └── worker.js           # Web Worker entry point (search)
│   ├── App.jsx                 # Root component + game logic
│   ├── index.css               # Global styles + design tokens
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
