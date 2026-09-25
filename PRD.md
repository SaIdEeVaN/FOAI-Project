# Product Requirements Document — FOAI Chess Engine

| | |
|---|---|
| **Product** | FOAI Chess Engine |
| **Course** | Foundations of Artificial Intelligence |
| **Repository** | [SaIdEeVaN/FOAI-Project](https://github.com/SaIdEeVaN/FOAI-Project) |
| **Live** | Firebase Hosting, project `foai-chess-engine` |
| **Status** | Milestones 1–12 delivered; §11 lists what is not built |
| **Last updated** | 2026-09-25 |

> **About this document.** The product was built before this PRD was written down, so it
> records the requirements the implementation actually meets rather than a forward plan.
> Every requirement carries a status, and §11 is an honest list of what is missing. Numbers
> quoted here are measured, not estimated; §9 says how.

---

## 1. Problem

A chess engine is the standard vehicle for teaching adversarial search, but the parts of it
that matter academically are invisible in a normal chess app. A player sees a move appear.
They do not see that alpha-beta pruning cut the tree by a factor of forty-five, that move
ordering halved it again, or that the evaluation function reached that move by weighing five
separate terms.

Course work on search is usually demonstrated with a terminal program and a table of node
counts in a report. That is hard to explore, hard to mark, and impossible to share.

## 2. Product summary

A browser chess game whose opponent is a classical search engine written from scratch, paired
with a **teaching mode** that runs the current position through several search configurations
at a fixed depth and shows what each one cost.

The whole engine runs client-side in a Web Worker. There is no backend, no account, and no
install: the product is a URL.

## 3. Users and what they need

| User | Need | How the product serves it |
|---|---|---|
| **Course marker** | See that search and evaluation are genuinely implemented, not wrapped from a library | Teaching mode exposes node counts per technique; the engine console streams each iterative-deepening pass live |
| **Student author** | A defensible artefact for submission, and a way to check the engine is correct | Plain-minimax node counts equal `perft(0..5)`, which makes move generation self-checking (§9) |
| **Classmate / visitor** | Play a game, understand what the engine is doing | Play screen with legal-move hints, evaluation bar and captured material; teaching mode needs no setup |

## 4. Goals

1. Implement minimax with alpha-beta pruning, iterative deepening, quiescence search, move
   ordering and a transposition table, correctly and from scratch.
2. Make the cost of each of those techniques **visible and comparable** on a real position.
3. Play a legal, complete game of chess against a human at interactive speed.
4. Ship as a static site that anyone can open on a phone or laptop.

### Non-goals

Playing strength beyond what the course requires; opening books; endgame tablebases; online
or human-vs-human play; accounts, persistence or analysis history; UCI compatibility with
external GUIs.

---

## 5. Functional requirements — Play

| # | Requirement | Status |
|---|---|---|
| P1 | Full legal move generation: sliding and stepping pieces, castling rights, en passant, promotion | Done |
| P2 | Every match starts from a *New game* dialog (on load, or *New game*) where the player picks a time control, a side — White, Black or Random (default) — and the engine's contempt. Nothing on the board moves until *Start game* | Done |
| P3 | Click a piece to see its legal targets; hints render as a dot on an empty square and a ring on a capture | Done |
| P4 | The previous move's origin and destination stay highlighted | Done |
| P5 | A king in check is marked distinctly | Done |
| P6 | Promotion prompts for queen, rook, knight or bishop rather than assuming a queen | Done |
| P7 | Game end is detected and named: checkmate, stalemate, fifty-move rule, insufficient material | Done |
| P8 | Threefold repetition is detected and ends the game as a draw | Done |
| P9 | Undo takes back one full move — the engine's reply and the player's move | Done |
| P10 | Evaluation bar shows the live score from White's perspective, clamped to ±8 pawns, and flips with the board | Done |
| P11 | Each seat shows the material it has captured and its point lead | Done |
| P12 | Move history lists the game in Standard Algebraic Notation (SAN: `Nf3`, `exd5`, `O-O`, `e8=Q+`, `Rad1`), newest move highlighted and scrolled into view | Done |
| P13 | Engine console reports best move (in SAN), depth, nodes and score, plus a line per deepening iteration, and how full the transposition table is when idle | Done |
| P14 | The engine heads for a repetition when it is losing and steers clear of one when it is winning | Done |
| P16 | Time controls as on chess.com / lichess: Bullet 1+0 and 2+1, Blitz 3+0, 3+2 and 5+0, Rapid 10+0 (default) and 15+10, or no clock. Both clocks start once each side has made its first move; the mover then earns the increment. The engine thinks for about 1/30 of its remaining time plus most of the increment, capped at 2s. A flag loses on time, or draws if the opponent has only a king. The time control is chosen only in the New game dialog and cannot change during a match; the panel beside the board just shows it. Undo is off in timed games. The last choice is remembered | Done |
| P15 | Premoves: while the engine thinks the player may queue one move, highlighted on the board. It is played the moment the engine replies if still legal (a promotion becomes a queen), otherwise dropped. Any click or a right-click cancels it | Done |
| P17 | Moves can be typed under the board in SAN or UCI. Input is forgiving — check marks, annotations, a missing `x` or `=`, castling with `0`, needless disambiguation — and a move that cannot be played says why: illegal, ambiguous (listing the candidates), or a promotion with no piece named | Done |
| P18 | Contempt, from −100 to +100 centipawns in steps of 10, is chosen in the *New game* dialog, remembered, and shown beside the board. Positive contempt makes the engine avoid draws, negative makes it seek them | Done |
| P19 | When a game ends, the result card's main action (also a click outside it, or Escape) returns to the board with the finished game on it. It never drops the player into the *New game* dialog; that opens only from *New game* | Done |

## 6. Functional requirements — Teaching mode

| # | Requirement | Status |
|---|---|---|
| T1 | Snapshot the current game position on open, so the game underneath can continue without changing the screen | Done |
| T2 | Search that position at a **fixed depth of 5** under three configurations: plain minimax, plain + alpha-beta, and a third the user controls | Done |
| T3 | Five techniques switchable independently: alpha-beta, MVV-LVA ordering, transposition table, quiescence, null-move pruning | Done |
| T4 | Quiescence and null-move depend on the alpha-beta window, so they switch off with it and are visibly disabled | Done |
| T5 | Report nodes searched, elapsed time, and cost relative to the plain-minimax baseline | Done |
| T6 | Show the winning (cheapest) configuration, and whether all three chose the same move | Done |
| T7 | Break the static evaluation into its five terms with signed bars: material, piece-square, pawn structure, king safety, mobility | Done |
| T8 | A search passing **60 seconds** stops and reports its node count as a lower bound (`≥`) rather than hanging | Done |
| T9 | Results are cached per position and configuration, so toggling a technique only re-runs what changed | Done |
| T10 | Configurations run one at a time in a dedicated worker, cheapest first, each result posted as it lands | Done |
| T11 | Any position can be loaded from FEN, or from five presets (the Opera Game mate in two, Win at Chess #1 and #4, the rook endgame and Kiwipete from the perft set). A FEN is validated before use and a bad one is explained — rank lengths, kings, pawns on the back rank, castling rights without king and rook at home, an impossible en passant square, the side not to move in check. *Current game* goes back to the snapshot | Done |
| T12 | The agreed (or differing) best moves are shown in SAN | Done |

---

## 7. Engine requirements

### 7.1 Search

| Property | Value |
|---|---|
| Algorithm | Negamax with alpha-beta |
| Iterative deepening | Depth 1 upward, hard ceiling of 12 |
| Time budget (play) | 2,000 ms, checked every 2,048 nodes |
| Early exit | Stops on a forced mate (score magnitude > 15,000) |
| Quiescence | Captures only, at the leaves, to blunt the horizon effect |
| Move ordering | Hash move first, then MVV-LVA captures, then promotions |
| Null-move pruning | R = 2, at nodes with at least 4 plies left (§7.6); not in check, not twice in a row, not near mate scores, not with only king and pawns |
| Draws in the tree | Repetition (§7.4), stalemate and the fifty-move rule, each scored with contempt |
| Contempt | A draw is worth −contempt to the engine and +contempt to its opponent |
| Mate scoring | ±20,000, less the ply of the mate, so a shorter mate is preferred |

### 7.2 Transposition table

Zobrist hashing over piece-square, side to move, castling rights and en-passant file. Keys are
64-bit, held as two 32-bit halves (XOR on 32-bit integers is exact, and no `BigInt` is allocated
per node), and seeded from a fixed constant so a run is reproducible. A lookup only returns a score
when the stored depth is sufficient and its bound (exact, upper, lower) settles the window.

The table has a **fixed size**: 2^19 slots (about 10 MB) in parallel typed arrays — key halves,
score, packed best move, depth, bound and search age — allocated once and never grown. A slot is
chosen by the low bits of the key and verified against all 64 bits. Replacement: the same position
is always refreshed; an entry from an earlier search always gives way; between two positions from
the same search, the deeper result stays. Mate scores are stored relative to the node and converted
back by ply on the way out, so a mate found on one path reads correctly on another.

Because its size is fixed, the game keeps **one table for the whole match** in the worker, and each
search starts where the last left off. It is cleared when the engine's side or its contempt changes,
since both alter what a draw is worth.

### 7.3 Evaluation

Centipawns, always from White's perspective. `evaluate()` and the teaching-mode `breakdown()`
share one code path, so the number on the bar and the number in the breakdown cannot disagree.

| Term | Rule |
|---|---|
| Material | P 100, N 320, B 330, R 500, Q 900, K 20,000 |
| Piece-square | Per-piece table, mirrored for Black |
| Pawn structure | −15 per doubled pawn, −20 per isolated pawn |
| King safety | −30 on an open file, a further −20 if open for the opponent too; +10 per pawn in the shield when the king is castled wide of the centre |
| Mobility | Knight and bishop mobility, weighted ×2; knight counts come from a precomputed per-square table |

### 7.4 Repetition identity

Two positions are the same for repetition purposes when placement, side to move, castling
rights and en passant all match. An en passant square only counts when a pawn of the side to
move can actually make the capture — otherwise a position reached with a spent en passant
square would not match the same position reached without one, and a real repetition would go
unnoticed.

The key is a plain string rather than a Zobrist hash, so distinct positions cannot collide.
It is deliberately absent from `makeMove`, which the search calls millions of times per move;
the game layer calls it once per committed move, and the search maintains its own stack.

**In the search.** The game's position history is passed into the search, which appends to it
as it makes moves. A node whose position already appears — in the game, or earlier on the
current line — scores 0. One earlier occurrence is enough: a position reachable twice is
usually reachable a third time, and waiting for a literal third occurrence would blind the
engine to forced repetitions. This is what lets it head for a draw when it is losing and
refuse one when it is winning. The scan is bounded by `halfMoveClock`, since nothing before
the last irreversible move can match, and steps two plies at a time, since only positions with
the same side to move can. Quiescence needs no check at all: it searches captures only, and a
capture resets the clock.

The check runs **before** the transposition probe. A cached score for the position would
otherwise be returned and hide the fact that the line had repeated it.

Teaching mode's search is deliberately left repetition-blind. Its whole claim is that plain
minimax visits exactly the cumulative perft (§7.5), and pruning repeated positions would
corrupt that count.

### 7.5 Correctness

Move generation is validated by perft against the published counts for the seven standard perft
positions (start, Kiwipete, positions 3–6 and the mirrored position 4), to 4.9 million leaves. The
node count of an unpruned minimax also equals `perft(0) + … + perft(d)`. Alpha-beta, ordering and
the transposition table must return the same score as plain minimax at the same depth — that
equivalence is the core claim teaching mode is built to demonstrate. Quiescence and null-move may
legitimately answer differently, and the page says so.

All of this runs as an automated suite (`npm test`, Node's built-in test runner, no dependencies):
perft, FEN, SAN, repetition, evaluation symmetry, the transposition table, the game search and the
teaching search. CI runs it before every build, so a failing test stops a deploy.

### 7.6 Null-move pruning

At a node where the side to move is not in check, the search passes the move and searches the
opponent's reply with a null window at beta, two plies shallower. If even that fails high, a real
move would too, and the node is cut. The pass is irreversible for repetition purposes: the
half-move clock is zeroed for its duration, so no line below it can match a position above it.

A null search that lands directly in quiescence sees captures only, so it is blind to a quiet
mating threat — on Win at Chess #1 it cut the one line that mates. Requiring 4 plies at the node
keeps every null search at least one full ply deep. §9 and `REPORT.md` give the
measurements behind the choice.

---

## 8. Non-functional requirements

| # | Requirement | How it is met |
|---|---|---|
| N1 | The UI must never freeze while the engine thinks | All search runs in a Web Worker; the main thread only renders |
| N2 | The engine must move at conversational speed | 2-second budget with iterative deepening, so there is always a legal move ready when time runs out |
| N3 | Works on a phone | Single-column layout below 900 px, fluid board, no horizontal scroll at 390 px |
| N4 | Pieces render identically on every device | Inline SVG paths with `fill` as a presentation attribute — never a font glyph, never a `<use>` reference, never dependent on CSS loading (§10) |
| N5 | Keyboard and screen-reader usable | Board squares holding a piece or a legal target are focusable and take Enter/Space, each labelled like "e2, White pawn"; technique toggles expose `role="switch"` |
| N6 | Respects motion preferences | Animation is suppressed under `prefers-reduced-motion` |
| N7 | A deploy reaches users immediately | `index.html` is served `no-cache, must-revalidate`; fingerprinted assets are `immutable` |
| N8 | No server, no data collection | Static hosting; nothing about a game leaves the browser |

---

## 9. Measured results

`REPORT.md` is the full account: perft, 917 teaching-search runs over 17 positions and depths 1–7,
self-play matches, a 105-position tactical suite, transposition-table sizing and a 128-game
benchmark against Stockfish. The headline numbers:

Starting position, fixed depth 5, one core:

| Configuration | Nodes | Time | Relative to baseline |
|---|---|---|---|
| Plain minimax | 5,072,213 | 15.0 s | baseline |
| + Alpha-beta | 113,360 | 0.42 s | 45× fewer |
| + MVV-LVA + TT | 58,390 | 0.28 s | 87× fewer |

- The plain node count is exactly the cumulative perft, which is what makes it a correctness
  check on the move generator rather than just a performance number.
- Fewer nodes is not automatically less time: move ordering costs about 40% of the speed per
  node, and is still by far the best trade.
- Over 17 positions, alpha-beta, ordering and the table return exactly plain minimax's score
  and move in all 79 searches minimax could finish; at depth 4 they cut its nodes about 110×
  (geometric mean).
- **Null-move pruning** is worth about +130 Elo in self-play (80 games, 68%); the 4-ply guard
  (§7.6) costs nothing measurable against the 3-ply one (−30 Elo, 95% interval −100 to +37).
- **Playing strength:** about 1600–1700 on Stockfish 19's `UCI_Elo` scale at 1 s per move
  (pooled estimate 1697 ± 72 over 128 games; 1600 ± 89 from the two anchors that bracket it).
  `REPORT.md` §5 explains why a range is the honest answer.

**Cost of repetition awareness.** Tracking positions through the search costs 2–5% of search
speed (97.6k to 95.2k nodes/second on the start position, 103.3k to 98.1k on an Italian
middlegame). Both positions still reach the same depth in the same budget and return the same
move. The game layer's own detection costs nothing measurable, being one key per played move.

**Evaluation performance.** Evaluation was roughly 65% of search time. Replacing case
conversion with lookup tables, per-call arrays with pawn-file counters, and hoisting constants
out of the hot paths took depth-5 plain minimax from 110.2 s to 13.6 s — **8.1×** — with
identical nodes, moves and scores across four positions and six configurations.

---

## 10. Architecture

```
Browser (no backend)
├── React 19 + Vite 8
│   ├── Play screen ─────────┐
│   └── Teaching mode ───────┤ post message
│                            ▼
└── Web Worker (src/engine/worker.js)
    ├── search.js          iterative deepening, for game play
    ├── teachingSearch.js  fixed depth, every technique switchable
    ├── moveGen.js         legal move generation
    ├── evaluation.js      static evaluation + per-term breakdown
    ├── transposition.js   Zobrist hashing + fixed-size TT
    ├── board.js           board state, FEN in and out, make/unmake
    ├── fen.js             FEN validation with plain-language errors
    ├── san.js             SAN out (toSan) and in (parseMove)
    └── move.js            move encoding, UCI

test/                      node --test suite: perft, FEN, SAN, search, TT, teaching
bench/                     Node scripts, not shipped: matches and Elo, experiments,
                           tactical suite, TT sizing; results in bench/results/
```

The worker accepts three messages — `search`, `teach` and `legalMoves` — and streams progress
back. The board is passed as a serialized snapshot, so the worker never shares mutable state
with the UI. The game worker keeps one transposition table across searches (§7.2).

**Piece rendering.** Every piece on both boards comes from one SVG path set, with `fill` and
`stroke` set as presentation attributes on the path itself. This is deliberate and was learned
the hard way: the Unicode chess characters carry emoji presentation in several system fonts,
and a colour font ignores `color`, so white pieces were painted black by the OS. Referencing a
shared `<symbol>` through `<use>` then reintroduced the same symptom on WebKit/iOS, where CSS
does not reliably cascade into the shadow tree a `<use>` creates — and a path with no fill
applied falls back to SVG's initial value, which is black. Colour now depends on nothing that
can fail to load.

**Deployment.** Push to `main` triggers GitHub Actions: `npm ci`, `npm test`, `npm run build`,
then `firebase deploy --only hosting`. Production bundle is roughly 353 KB of JS (112 KB gzipped),
14 KB of CSS and an 18 KB worker.

---

## 11. Known gaps

| Gap | Consequence | Notes |
|---|---|---|
| The search scores the *first* repetition as a draw | Inside the tree a position seen twice is treated as drawn, which is one occurrence short of the actual rule | Deliberate, and what engines normally do: waiting for a literal third occurrence would hide forced repetitions. The game layer still requires a true threefold before declaring the draw |
| Quiescence ignores checks | A leaf in check is scored by standing pat, and a quiet mate at the horizon is invisible | The reason null-move needs 4 plies left (§7.6). Searching check evasions in quiescence would close it |
| No check extension, killer moves or history heuristic | Quiet moves are searched in generation order; forcing lines are not deepened | Each is a standard next step; the test suite and match runner are there to measure them |
| Transposition table entries depend on the path | A draw score stored because a line repeated can be reused where it did not | Accepted by most engines; the table is cleared when contempt or the engine's side changes |
| Contempt applies to draws the search can see | Insufficient material is not recognised inside the tree | The game layer still declares it |
| No opening book | The engine searches from move one | Deliberate — out of scope per §4 |
| The Elo estimate is on Stockfish's limited-strength scale | It is an estimate against one family of reference engines at one time control | See `REPORT.md` for the method and its caveats |

---

## 12. Milestones

| # | Milestone | State |
|---|---|---|
| 1 | Board representation, FEN, legal move generation | Delivered |
| 2 | Evaluation and minimax with alpha-beta | Delivered |
| 3 | Iterative deepening, quiescence, MVV-LVA ordering, transposition table; Web Worker | Delivered |
| 4 | Teaching mode: fixed-depth comparison, technique toggles, evaluation breakdown | Delivered |
| 5 | Interface pass: one design system across both screens, SVG pieces, mobile and accessibility | Delivered |
| 6 | Threefold repetition detection | Delivered |
| 7 | Repetition-aware search | Delivered |
| 8 | SAN notation — move list, engine console and typed input | Delivered |
| 9 | FEN import in teaching mode, with sharp presets | Delivered |
| 10 | Null-move pruning in the game search, contempt, fixed-size transposition table | Delivered |
| 11 | Automated test suite with perft on the standard positions; CI gate | Delivered |
| 12 | Playing-strength benchmark and extended experiments; final report | Delivered |

---

## 13. Acceptance criteria

The product is acceptable for submission when all of the following hold:

1. A complete legal game can be played to a named ending against the engine, as either colour —
   checkmate, stalemate, threefold repetition, fifty-move rule or insufficient material.
2. Plain minimax and alpha-beta return the same move and score at the same depth, and the
   plain node count matches cumulative perft.
3. Teaching mode reports node counts for all three configurations on any reachable position,
   and a configuration that overruns reports a bounded result rather than hanging.
4. The engine never blocks the interface, and always produces a move within its time budget.
5. The site renders correctly on a phone, with pieces in the right colours.
6. A push to `main` reaches the live site without manual steps.
7. `npm test` passes, including perft on the standard positions, and CI refuses to deploy when it
   does not.

Criteria 1–7 are currently met.

## 14. Open questions

1. ~~Should teaching mode allow an arbitrary position (FEN entry)?~~ Answered: it does (T11).
2. Is a fixed depth of 5 the right default? It is chosen so plain minimax finishes in tens of
   seconds; a busy middlegame still hits the 60-second bound.
3. Is engine strength in scope for marking at all, or only the visibility of the techniques?
   Either way it is now measured (`REPORT.md`).
