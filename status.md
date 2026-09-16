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
- [ ] Commit and push to `main`
- [ ] **Needs a human look:** open <http://localhost:5173> → *Teaching mode* and check the hand-drawn SVG piece
      silhouettes and the layout; the Chrome extension was not connected, so this was never seen in a browser
