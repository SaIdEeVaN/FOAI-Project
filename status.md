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


## Follow-up — still black on a phone

Reported after the first fix shipped: white pawns were still black on mobile. Two independent causes,
both closed.

- [x] **The colour depended on a stylesheet reaching into a `<use>` shadow tree.** Pieces were
      `<svg class="pc-white"><use href="#pc-p"></svg>` with `fill` set by a CSS rule on the wrapper.
      WebKit/iOS does not reliably cascade CSS into the shadow tree a `<use>` creates, and a path with
      no fill applied falls back to SVG's initial value — **black**. That is exactly the reported
      symptom: white pieces turn black while black pieces look fine by accident.
      Paths are now inlined per piece, with `fill` and `stroke` as presentation attributes on the path
      itself. Verified in Chromium at 390px and under iPhone 13 emulation: 16 white + 16 black, and
      **identical with the stylesheet blocked outright**, which is the point — the colour no longer
      depends on CSS at all. CSS can still override deliberately by targeting `.pc path`, which is how
      the header mark stays accent green
- [x] **Phones could hold a stale build.** `firebase.json` set no cache headers, so Firebase's default
      let a phone keep `index.html` — and therefore the fingerprinted JS it names — for an hour after a
      deploy. HTML is now `no-cache, must-revalidate`; `/assets/**` is `immutable`, since Vite
      fingerprints it. The catch-all is listed first so the config is correct whichever way Firebase
      resolves overlapping globs
- [ ] **Could not verify from this session:** the live site (the egress proxy returns 403 for
      `*.web.app`), and WebKit itself (Playwright's WebKit download is blocked), so iOS was reasoned
      about and tested by proxy rather than run


## Threefold repetition

- [x] `Board.positionKey()` — placement, side to move, castling rights and en passant as an exact
      string, so distinct positions cannot collide. Kept out of `makeMove`, which the search calls
      millions of times per move; the game layer calls it once per committed move
- [x] En passant only forms part of the identity when a pawn of the side to move can really capture,
      otherwise a position reached with a spent en passant square would not match the same position
      reached without one and a real repetition would be missed
- [x] `hasThreefoldRepetition(keys)` in `board.js`; App keeps the game's position list in a ref
      (the worker's `onmessage` closure is installed once and would capture a stale array), pushes
      after every committed move, resets on New Game and rebuilds on Undo
- [x] Draw is reported as "Threefold Repetition" alongside stalemate, the fifty-move rule and
      insufficient material
- [x] Verified: 12 checks covering the knight-shuffle draw firing at ply 8 and not at ply 4 or 7,
      non-consecutive repetitions, a normal opening never triggering, side-to-move and castling
      rights changing the key, capturable vs spent en passant, no file-wrap false positive, and
      make/unmake restoring the key exactly
- [x] No regression: perft(0..4) exact, depth-4 plain minimax still 206,604 nodes = cumulative perft
- [ ] **Not done:** the search itself is still repetition-blind — it cannot aim for a repetition when
      losing or dodge one when winning

## PRD

- [x] `PRD.md` at the repo root — problem, users, per-screen requirements with status, engine spec,
      measured results, architecture, known gaps, milestones, acceptance criteria
- [x] Kept out of the README entirely, on request


## Threefold repetition, part two — the search

- [x] The game's position history is passed into `SearchEngine`, which appends to it as it makes
      moves; a node whose position already appears scores 0
- [x] One earlier occurrence is enough inside the tree. Holding out for a literal third would hide
      forced repetitions, so this is the standard engine behaviour; the game layer still requires a
      true threefold before it declares the draw
- [x] The check runs before the transposition probe — a cached score would otherwise be handed back
      and hide that the line had repeated the position
- [x] The scan is bounded by `halfMoveClock` (nothing before the last irreversible move can match)
      and steps two plies at a time (only the same side to move can match). Quiescence is exempt:
      captures only, and a capture resets the clock
- [x] Behaviour verified: a queen down with a repetition available, the engine plays it and scores 0
      instead of −1060; a queen up in the same shape, it refuses and mates instead; an unrelated
      history changes nothing
- [x] Cost measured at 2–5% of search speed (97.6k → 95.2k n/s start, 103.3k → 98.1k n/s Italian),
      same depth reached and same moves returned
- [x] `teachingSearch.js` deliberately left alone — repetition pruning would corrupt the perft
      equivalence that teaching mode exists to demonstrate. Re-checked: plain minimax depth 4 is
      still 206,604 nodes = cumulative perft, and alpha-beta still agrees with it
- [x] ~~Draw scores are a flat 0, with no contempt setting~~ — contempt added, see the last section


## Future implementations — all six items

- [x] **SAN.** `san.js`: `toSan` (captures, en passant, promotions, file/rank/square disambiguation,
      castling, `+`/`#`), `lineToSan`, and `parseMove`, which reads SAN the way people type it or
      UCI and says why a move cannot be played. Move list, engine console, engine log and the
      teaching-mode caption are in SAN; a box under the board takes typed moves
- [x] **FEN import in teaching mode.** `fen.js` validates with plain-language errors; `Board.toFen`.
      Position row with *Current game*, five Stockfish-verified presets (Opera mate, WAC #1, WAC #4,
      rook endgame, Kiwipete) and a FEN box. Fixed on the way: the search runner never restarted
      when the position changed, so every card sat at "queued"
- [x] **Null-move pruning in the game search.** R = 2 with a 4-ply guard. The first version (guard 3)
      missed the mate in two on WAC #1 because the null search was pure quiescence. Self-play,
      80 games each at 300 ms: null-move vs none +49 =11 −20 (+132 Elo); guard 4 vs guard 3
      +28 =17 −35 (−30, 95% interval −100 to +37, not significant) — so guard 4
- [x] **Contempt.** −100…+100 cp in the New game dialog; repetition, stalemate and fifty-move draws in
      the tree score −contempt for the engine. Tested on a repetition and a stalemate trap
- [x] **Bounded transposition table.** Typed arrays, 2^19 slots (~10 MB), 64-bit keys as two
      32-bit halves, replacement: same key refreshed / older search gives way / deeper stays.
      Mate scores stored per node. One table per game in the worker. Teaching-mode counts move by
      ≤0.2% (58,356 → 58,464 on the start position at depth 5), same moves and scores
- [x] **Automated tests.** 53 `node:test` tests, `npm test` (~4 s) and `npm run test:deep`; perft on
      the 7 standard positions matches every published count to 4.9M leaves. CI runs the suite
      before the build
- [x] **Benchmark playing strength.** `bench/match.js` against Stockfish 19 with `UCI_LimitStrength`,
      1 s per move, 128 games: 65.6% vs 1500, 34.4% vs 1700, 29.7% vs 1900, 28.1% vs 2100. Pooled
      estimate 1697 ± 72; 1600 ± 89 from the two bracketing anchors. The curve does not fit one
      logistic (the stronger settings lose too often), so REPORT.md reports 1600–1700
- [x] **Experiments and report.** 917 teaching-search runs (17 positions × depths 1–7 × 8
      configurations); alpha-beta, ordering and TT agree with minimax in all 79 comparable runs;
      105-position Stockfish-verified tactical suite at 0.2/1/5 s; TT sizing and Fine #70; final
      engine vs the pre-iteration engine +42 =17 −21 (+93 Elo). REPORT.md
- [x] **Fixed on the way:** the Zobrist keys came from an LCG whose low bits are nearly periodic, so
      the fixed-size table (which indexes by low bits) could only use half its slots — caught by a
      fill rate that did not add up, fixed with Mulberry32, pinned by a test. Teaching mode's
      null-move now uses the game search's 4-ply guard too
- [x] **UI fix.** The game-over card returns to the board (button, click outside, Escape) instead of
      opening the time-control dialog; *New game* is a second button
- [x] Checked in Chromium on the production build: typed moves and errors, SAN list, contempt in the
      dialog and the side panel, game-over → board, teaching presets and FEN errors, no horizontal
      overflow at 390px


## Killer moves, a tapered evaluation, and Texel tuning

- [x] **Killer moves and the history heuristic** in the game search: hash move, MVV-LVA captures and
      promotions, killer 1, killer 2, then quiet moves by `history[side][from][to]` (+depth² per
      cutoff, halved past 60,000). Teaching mode's ordering left exactly as it was
- [x] Measured with `bench/nodes.js` at depth 7 on 17 positions: with both off, node-for-node the old
      tree (14,202,273); with both on, 8,172,405 (−42%), same best move in 17/17. Self-play vs the
      previous engine, 80 games at 300 ms: +34 =22 −24, +44 Elo (−21 to +111)
- [x] **Fixed:** a search could return no move when time ran out inside depth 1 (seen at 40 ms a
      move in a cold worker; the app ignores a move-less result, so in bullet the engine would sit
      until it lost on time). Depth 1 now always completes; pinned by a test
- [x] **Tapered evaluation** (`evaluation.js`, `evalLayout.js`, `weights.js`): every weight has a
      middlegame and an endgame value blended by phase (N/B 1, R 2, Q 4; max 24). New terms: passed
      pawns by rank, bishop pair, rook on open/half-open file, mobility counted as reachable squares
      for N, B, R. Black now reads tables with `sq ^ 56` (a mirror) instead of `63 − sq` (a rotation,
      only right while every table was symmetric). Each term rounded towards zero on its own, so
      the breakdown still sums exactly and mirrored positions negate exactly
- [x] Teaching mode's breakdown shows the game phase it blended at
- [x] Hand-set tapered evaluation vs the killers/history engine: +61 =7 −12 (80.6%), +248 Elo
      (+169 to +357), at 12% fewer nodes per second
- [x] **Texel tuning.** `Evaluation.features()` gives each position as sparse pattern counts; a test
      checks that features × weights reproduces `evaluate()` on 407 positions. `bench/datagen.js`:
      self-play at 40 ms, random openings, quiet positions only, labelled with the game result.
      3,941 games / 257,691 positions in ~100 min on three cores (`bench/data/`, not committed).
      `bench/tune.js`: fit K, then full-batch Adam on the mean squared error, whole games held out
      for validation (early stopping, model choice) and test (reported only)
- [x] **Overfitting, found and handled.** A split by position made the fit look good; a split by game
      showed it memorising games. Fitting all ~800 weights, or adding L2 towards the hand-set values,
      or plain gradient descent, all generalised worse than fitting the 44 scalar weights alone and
      keeping the hand-set piece-square tables. Test error 0.14098 → 0.13946
- [x] Tuned vs hand-set weights: +42 =14 −24 (61.3%), +80 Elo (+11 to +155)
- [x] Final engine vs the engine this iteration started from: +53 =12 −15 (73.8%), +179 Elo
      (+108 to +268); the steps add up to ~+370, the usual self-play inflation
- [x] Tactical suite at 1 s: 94/105 against 88/105 for the previous engine, at the same
      depth (6.30 vs 6.24)
- [x] Stockfish benchmark at 1 s, anchors 1700/1900/2100/2300 (32 games each): pooled 2015 ± 71,
      1982 ± 89 from the bracketing pair. Same misfit as September (the 2300 setting scored 48%).
      Like for like on 1700/1900/2100: September 1730 ± 82, final 1922 ± 77, +192
- [x] **Interrupted once**: the container restarted 26 games into the Stockfish run, and match.js
      only saved at the end. It now takes `--log games.jsonl`, appends each game as it finishes, and
      skips logged games when restarted
- [x] REPORT.md §6–9, PRD (evaluation spec, gaps, milestones 13–15), README
