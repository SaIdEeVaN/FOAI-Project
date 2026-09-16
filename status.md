# Status

## Current task — Teaching Mode (spec `Teaching Mode Spec.md`, mockup 1g, PRD §10 Milestone 4)

- [x] Read the spec and explore the codebase
- [x] Fixed-depth teaching search with per-technique toggles (alpha-beta, MVV-LVA ordering, TT, quiescence, null-move) and node counting
- [x] Per-term evaluation breakdown (material, piece-square, pawn structure, king safety, mobility)
- [x] Worker: `teach` message that runs configs sequentially and streams progress + each result as it lands
- [x] Verify the engine in Node: plain minimax and alpha-beta agree, real node counts and timings
  - Start position, depth 5: plain 5,072,213 nodes / 110s · alpha-beta 113,360 / 2.8s · +MVV-LVA+TT 58,356 / 1.8s — all play e2e4
  - Plain node count equals perft(0..5), so move generation and the search are exact
- [x] Speed up the evaluation (≈65% of search time) without changing any score — plain minimax must land in tens of seconds
  - Lookup tables instead of case conversion, pawn-file counters instead of per-call arrays, hoisted constants in `isSquareAttacked` / `makeMove`
  - Start position depth 5 plain: 110.2s → **13.6s** (8.1×); Italian depth 4 plain: 22.1s → **3.0s** (7.4×)
  - Verified identical: same nodes, moves and scores across 4 positions × 6 configs before vs after
- [x] SVG piece symbol set (`#pc-p` … `#pc-k`, 45×45 viewBox)
- [x] TeachingMode screen: header, 3 comparison cards, read-only 260px board, technique pills, evaluation breakdown
- [x] Styles: amber/red tokens, JetBrains Mono, animations, responsive (<760px), accessibility (`role="switch"`)
- [x] Play / Teaching mode navigation in App (snapshot current position on open)
- [x] Production build passes (`npm run build`, 430 modules, no errors)
- [x] Check the screen renders — Node/React server-render smoke test passed (structure, pills, board, breakdown)
- [x] Update README
- [x] Commit and push to `main` (`3b30d37`, which also triggers the Firebase deploy workflow)
- [x] **Seen in a browser** — both screens were driven in headless Chromium at 1280/768/390px and screenshotted;
      the SVG silhouettes and the teaching-mode layout render as intended

## Interface pass — one design system, and the white-piece bug

- [x] **Fixed: white pieces rendered black.** `ChessBoard` drew pieces as Unicode glyphs (`♟` et al.) and recoloured
      them with `color` / `-webkit-text-fill-color`. Those code points have emoji presentation in several system
      fonts, and a colour font ignores both properties, so the OS painted every "white" piece — pawns most visibly —
      in the black emoji form. The board now uses the same SVG symbol set teaching mode already used, so the fill is
      ours. Verified in Chromium: white computes to `rgb(248, 247, 243)`, black to `rgb(31, 30, 27)`
- [x] Every other piece follows the same path: promotion dialog, game-over icon, header mark, captured strip, favicon
- [x] `index.css` rebuilt as one system — tokens, then primitives both screens share (cards, tiles, wells, micro-labels,
      mono numerals, bars, pills), then screen specifics. Teaching mode keeps its look and now shares the rules
- [x] Play screen restyled to match: seats with captured material, in-board coordinates, board-height evaluation bar,
      stat tiles, sticky move-list header, modals
- [x] Fixed alongside: status text assumed the player was White; the evaluation sign assumed the engine was Black
      (both wrong after *Flip board*); `Math.abs` on a formatted string dropped the bar's decimal; the primary button
      hovered blue against a green accent
- [x] Keyboard and screen-reader support on the board — squares with pieces or legal targets are focusable and
      respond to Enter/Space, each labelled like "e2, White pawn"
- [x] Move list and engine log scroll to the newest entry; `prefers-reduced-motion` honoured
- [x] Dropped the unused Vite starter files (`main.ts`, `counter.ts`, `style.css`, `public/icons.svg`) and replaced
      the emoji-glyph favicon with an SVG pawn
- [x] Checked in Chromium on the production build: play as White and as Black, flipped board and bar, undo,
      new game, teaching-mode round trip, promotion and game-over dialogs, no horizontal overflow at 390px
