# FOAI Chess Engine — Final Report

*Foundations of Artificial Intelligence · course project · September 2026, extended November 2026*

This report evaluates the engine behind the FOAI Chess Engine site: how correct it is, what each
search technique buys, what the final round of engine work changed, and how strong the result
plays. Sections 6–9 were added in November 2026 for a further round: move ordering for quiet
moves, a tapered evaluation, and Texel tuning — the evaluation's weights learned from the engine's
own games, which is the project's machine-learning component. Every number here was measured for
this report on the same kind of machine (Node 22, Linux, 4 cores), and every script and raw result
needed to reproduce it is in the repository (§12).

## Summary

**November 2026** (§6–9):

- **Killer moves and the history heuristic** cut the nodes the game search needs to reach depth 7
  by 42% over 17 positions, with the same best move in every one. +44 Elo in self-play, too few
  games to tell from zero.
- **A tapered evaluation** — middlegame and endgame values blended by game phase, plus passed
  pawns, the bishop pair, rooks on open files and true mobility — is the largest gain: **+248 Elo**,
  although it costs 12% of search speed.
- **Texel tuning** fitted the evaluation to 257,691 positions from 3,941 self-play games by
  logistic regression. Fitting all ~800 weights overfits this much data; fitting the 44 scalar
  weights generalises best (held-out prediction error −1.1%) and wins **+80 Elo** against the
  hand-set weights (95% interval +11 to +155).
- **Altogether +179 Elo** against the September engine (80 games, 73.8%), and 94 tactical
  positions solved at 1 second instead of 88. On Stockfish 19's limited-strength scale at 1 s a
  move, **about 1900–2000** (pooled 2015 ± 71 over 128 games): +192 over the September engine on
  the three settings both played.
- One bug found on the way: a search that ran out of time inside depth 1 returned no move. Depth 1
  now always completes.

**September 2026** (§1–5; §1 describes the current engine, §2–5 the engine as it was then):

- **Correct.** Move generation matches the published perft counts on all seven standard
  positions, 17.0 million leaves in all. 53 automated tests run on every build and gate the deploy.
- **Each technique measured on 17 positions to depth 7.** Alpha-beta, move ordering and the
  transposition table give exactly plain minimax's move and score in all 79 comparable searches,
  and together cut the tree about 110× at depth 4 (geometric mean). A ply costs 24–27× more for
  plain minimax and 2–5× more with everything on.
- **Null-move pruning is worth about +130 Elo** in self-play (80 games, 68%). Its depth guard was
  chosen by experiment after the first version missed a mate in two.
- **The transposition table is now fixed-size** (10 MB, never grows) and kept for the whole game.
  Making it fixed-size exposed a flaw in how the hash keys were generated, now fixed and tested.
- **Contempt** makes the engine seek or avoid draws, from −100 to +100 centipawns.
- **Playing strength: about 1600–1700 on Stockfish 19's `UCI_Elo` scale** at one second a move
  (128 games against four calibrated settings; pooled estimate 1697 ± 72). §5.3 explains why this
  is a range rather than one number.
- **The final engine beats the one this iteration started from** 42–21 with 17 draws (63%, about
  +93 Elo), searching half a ply deeper at the same time per move.

---

## 1. The engine

A classical search engine written from scratch in JavaScript, running in a Web Worker:

| Part | What it does |
|---|---|
| Board and moves | 64-square array, make/unmake, legal move generation, FEN in and out, SAN in and out |
| Evaluation | Tapered (§7): material, piece-square tables, pawn structure with passed pawns, king safety, mobility, rooks on open files and the bishop pair, each with a middlegame and an endgame weight blended by game phase; the scalar weights learned by Texel tuning (§8). Centipawns, from White's side |
| Search | Negamax with alpha-beta, iterative deepening to a time budget, captures-only quiescence; ordering by hash move, MVV-LVA captures, then killer moves and the history heuristic (§6) |
| Transposition table | 64-bit Zobrist keys; fixed size (2^19 slots, ~10 MB); depth-preferred replacement with aging; kept for the whole game |
| Null-move pruning | R = 2, only with at least 4 plies left, never in check, twice in a row, near mate or with only king and pawns |
| Draws | Repetition (against the game's history and the current line), stalemate and the fifty-move rule, all scored with a configurable contempt |
| Teaching search | A separate fixed-depth search in which every technique can be switched off, to measure what each one costs |

What the September iteration added, against the plan in `future_implementations` (§6–9 cover November):

| Plan item | Delivered | Where |
|---|---|---|
| Benchmark playing strength | Matches against Stockfish at calibrated strengths; Elo estimate with an interval | `bench/match.js`, §5 |
| SAN for move input and output | Move list, engine console and teaching mode in SAN; moves can be typed in SAN or UCI | `src/engine/san.js`, `MoveEntry.jsx` |
| FEN import in teaching mode | Validated FEN entry with explained errors, five sharp presets | `src/engine/fen.js`, `TeachingMode.jsx` |
| Null-move pruning in the game search | With a depth guard chosen by experiment | `src/engine/search.js`, §4.1 |
| Configurable contempt | −100…+100 cp in the New game dialog | `search.js`, `Modals.jsx`, §4.3 |
| Bounded transposition table | Fixed-size typed arrays with a replacement policy | `src/engine/transposition.js`, §4.2 |
| Automated test suite with more perft positions | 53 tests; perft on 7 standard positions; CI gate | `test/`, §2 |
| Wider experiments, final report | 17 positions × depths 1–7 × 8 configurations; this document | `bench/experiments.js`, §3 |
| After a game, back to the main screen | The result card returns to the board, not the time-control dialog | `Modals.jsx`, `App.jsx` |

---

## 2. Correctness

### 2.1 Perft

Perft counts the leaves of the legal-move tree to a fixed depth. Any wrong move anywhere — a
missed en passant, castling through check, a pinned piece allowed to move, a promotion dropped —
changes the count, so agreeing with the published numbers is the strongest correctness check a move
generator has. The engine matches all of them:

| Position | FEN | d1 | d2 | d3 | d4 | d5 |
|---|---|---:|---:|---:|---:|---:|
| Start | `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -` | 20 | 400 | 8,902 | 197,281 | 4,865,609 |
| Kiwipete (2) | `r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -` | 48 | 2,039 | 97,862 | 4,085,603 | |
| Position 3 | `8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -` | 14 | 191 | 2,812 | 43,238 | 674,624 |
| Position 4 | `r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq -` | 6 | 264 | 9,467 | 422,333 | |
| Position 4, mirrored | `r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ -` | 6 | 264 | 9,467 | 422,333 | |
| Position 5 | `rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ -` | 44 | 1,486 | 62,379 | 2,103,487 | |
| Position 6 | `r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - -` | 46 | 2,079 | 89,890 | 3,894,594 | |

Every count above is both the published value and the engine's — 30 depths across seven
positions, 17.0 million leaves in all (`npm run test:deep`, about 13 s). Between them these
positions exercise castling on both sides and through attacked squares, en passant (including the
discovered-check case in position 3), every promotion piece with and without capture, and pins.

The mirrored position 4 is the same position with colours swapped, which catches asymmetries
between White and Black move generation.

### 2.2 The automated suite

`npm test` runs 53 tests with Node's built-in runner and no dependencies, in about 4 seconds; CI
runs it before every build, so a failing test stops a deploy.

| File | What it pins down |
|---|---|
| `perft.test.js` | The counts above (depths up to a million leaves by default; all of them with `npm run test:deep`) |
| `fen.test.js` | FEN round trips on every perft position and through moves; validation messages for 15 kinds of bad FEN |
| `san.test.js` | The Opera Game read and written back move for move; en passant, every promotion, file/rank/square disambiguation, castling, check and mate marks; forgiving input and the reasons a move is refused |
| `repetition.test.js` | Threefold repetition on a knight shuffle (at ply 8, not before), non-consecutive repetitions, side to move and castling rights in the key, en passant only when capturable, make/unmake restoring the key |
| `evaluation.test.js` | Colour symmetry term by term on 7 positions; the breakdown adding up to `evaluate()` |
| `transposition.test.js` | The table never grows; bound and depth rules; full-key verification; replacement policy; mate scores adjusted by ply; Zobrist transpositions match and everything that matters changes the key; every slot of a small table is reachable (§4.2) |
| `search.test.js` | Mate in one and two with and without null-move; WAC #1 found at depth 4 with the null-move guard, and missed by a null search that drops straight into quiescence (§4.1); contempt steering towards and away from a repetition and a stalemate; a reused table staying bounded |
| `ui-helpers.test.js` | Score and mate formatting; premove target squares |
| `teaching.test.js` | Plain minimax visits exactly perft(0)+…+perft(3) on four positions; alpha-beta, ordering and the table return minimax's score; a search past its limit stops and says so |

### 2.3 The equivalence teaching mode relies on

Teaching mode claims that alpha-beta, move ordering and the transposition table change only the
cost of a fixed-depth search, never its answer. §3.4 checks that claim across all 17 experiment
positions and every depth plain minimax could finish.

---

## 3. Search techniques across positions and depths

### 3.1 Method

`bench/experiments.js` runs the teaching search — the same code as the teaching-mode screen — on
17 positions: four openings, four busy middlegames (the perft positions), five tactics (the Opera
Game mate, Win at Chess #1 and #4, two positions from the tactical suite in §4.1) and four
endgames (the perft rook endgame, Fine #70, king and pawn, queen against rook). Each is searched
at every depth from 1 to 7 under eight configurations, from plain minimax up to everything on. A
configuration stops going deeper on a position once one search passes 30 seconds; that search is
reported as a lower bound (`≥`). Node counts are exact and deterministic; times are single-core.

917 searches ran, 51 of which hit the 30-second limit.

These runs used the September evaluation. Plain minimax visits every node whatever the evaluation
says, so its counts are unchanged today; the pruned configurations' counts depend on the scores and
would come out somewhat different with the evaluation of §7–8, but the comparisons this section
draws between techniques do not depend on it.

### 3.2 How many nodes each configuration visits

At depth 5 (`≥` marks a search stopped at 30 s):

| Position | Plain minimax | Alpha-beta | + MVV-LVA ordering | + TT | + ordering + TT | + ordering + TT + null-move | + ordering + TT + quiescence | Everything |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Start position | 5,072,213 | 113,360 | 72,019 | 85,004 | 58,390 | 55,252 | 79,813 | 79,029 |
| Italian | ≥ 10,583,040 | 329,809 | 64,306 | 255,058 | 55,422 | 34,335 | 543,462 | 533,337 |
| Sicilian Najdorf | ≥ 10,746,880 | 1,245,752 | 451,197 | 957,026 | 352,563 | 318,537 | 1,077,389 | 1,078,354 |
| Queen's Gambit Declined | ≥ 10,260,480 | 890,764 | 206,052 | 704,169 | 165,521 | 164,233 | 105,606 | 56,303 |
| Kiwipete | ≥ 10,487,808 | 6,644,725 | 74,871 | 4,902,919 | 51,346 | 51,441 | 218,832 | 218,539 |
| Perft position 4 | ≥ 10,431,488 | 508,080 | 19,940 | 458,072 | 18,230 | 18,240 | 60,279 | 60,347 |
| Perft position 5 | ≥ 10,905,600 | 233,288 | 65,291 | 164,615 | 37,928 | 37,877 | 73,124 | 45,650 |
| Perft position 6 | ≥ 10,345,472 | 1,445,842 | 149,134 | 1,100,547 | 123,126 | 118,716 | 189,322 | 104,712 |
| Opera Game, mate in 2 | ≥ 13,059,072 | 1,005,438 | 50,511 | 748,342 | 39,310 | 29,059 | 70,402 | 21,387 |
| Win at Chess #1 | ≥ 12,018,688 | 766,780 | 152,706 | 605,355 | 111,848 | 56,028 | 213,251 | 48,337 |
| Win at Chess #4 | ≥ 11,835,392 | 87,948 | 19,861 | 50,605 | 16,586 | 6,968 | 34,410 | 16,011 |
| Suite FOAI-T.082 (Nd6) | ≥ 12,343,296 | 461,221 | 26,984 | 325,695 | 22,401 | 19,532 | 50,303 | 34,506 |
| Suite FOAI-T.085 (Bh3) | 8,065,282 | 170,754 | 25,483 | 135,403 | 20,214 | 15,286 | 46,555 | 40,732 |
| Rook endgame (perft 3) | 720,880 | 53,114 | 12,391 | 40,108 | 9,885 | 2,034 | 20,764 | 17,629 |
| Fine #70 (pawn endgame) | 2,595 | 317 | 317 | 180 | 180 | 180 | 289 | 289 |
| King and pawn | 23,681 | 5,068 | 4,420 | 2,609 | 2,174 | 2,174 | 4,679 | 4,679 |
| Queen vs rook | 1,271,035 | 49,261 | 5,647 | 32,154 | 4,259 | 2,543 | 8,134 | 4,966 |

Relative to plain minimax, as a geometric mean over the positions where minimax finished (their
number in brackets):

| Configuration | d1 | d2 | d3 | d4 | d5 | d6 | d7 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Alpha-beta | 1.0× (17) | 2.6× (17) | 5.8× (17) | 20.8× (17) | 17.5× (6) | 20.6× (3) | 28.5× (2) |
| + MVV-LVA ordering | 1.0× (17) | 6.2× (17) | 17.3× (17) | 102.6× (17) | 48.4× (6) | 51.4× (3) | 31.0× (2) |
| + TT | 1.0× (17) | 2.6× (17) | 5.8× (17) | 23.2× (17) | 26.3× (6) | 47.5× (3) | 169.5× (2) |
| + ordering + TT | 1.0× (17) | 6.2× (17) | 17.3× (17) | 110.6× (17) | 70.1× (6) | 105.7× (3) | 187.2× (2) |
| + ordering + TT + null-move | 1.0× (17) | 6.2× (17) | 17.3× (17) | 110.6× (17) | 105.1× (6) | 116.3× (3) | 187.2× (2) |
| + ordering + TT + quiescence | 0.2× (17) | 1.3× (17) | 5.2× (17) | 41.0× (17) | 37.3× (6) | 59.9× (3) | 123.7× (2) |
| Everything | 0.2× (17) | 1.3× (17) | 5.2× (17) | 41.0× (17) | 42.7× (6) | 72.7× (3) | 123.7× (2) |

- **Alpha-beta** alone saves little at shallow depth and about 20× by depth 4. It never changes
  the result (§3.4), only the work.
- **Move ordering** is what makes alpha-beta pay: at depth 4 it multiplies the saving by five, to
  about 100×. Alpha-beta cuts a branch only once it has seen a good enough move; trying captures of
  valuable pieces first finds that move early. On Kiwipete at depth 5, alpha-beta alone needs
  6.6 million nodes and with ordering 75 thousand — 89× fewer.
- **The transposition table** adds little on its own at shallow depth, and more with every ply
  (47× at depth 6 and 170× at depth 7 on the small endgames minimax could finish, where alpha-beta
  alone is at 21× and 29×): the deeper the search, the more move orders reach the same position.
  Its other job is ordering — the stored best move is tried first — which is why ordering and the
  table together beat either alone.
- **Null-move pruning** depends on the position more than anything else here. At depth 5 it saves
  nothing in six of the 17 positions (it is never tried in the pawn endgames, and rarely pays in
  sharp ones), a median of 10%, and up to 79% in quiet ones — the rook endgame drops from 9,885
  to 2,034 nodes.
- **Quiescence** makes every leaf more expensive — it keeps searching captures past the horizon —
  so at depth 1 it searches five times as many nodes as plain minimax. It buys a different, better
  answer (§3.4), not a cheaper one.

### 3.3 Effective branching factor

How many times more nodes each extra ply costs. Each column averages over the positions every row
finished at both depths, so the rows compare like with like (plain minimax is averaged over the
positions it finished, given first in the column header):

| Configuration | d1→d2 (17 / 17) | d2→d3 (17 / 17) | d3→d4 (17 / 17) | d4→d5 (6 / 17) | d5→d6 (3 / 12) | d6→d7 (2 / 5) |
|---|---:|---:|---:|---:|---:|---:|
| Plain minimax | 23.64 | 27.33 | 24.16 | 14.30 | 8.14 | 6.59 |
| Alpha-beta | 9.26 | 11.99 | 6.75 | 10.45 | 4.04 | 6.87 |
| + MVV-LVA ordering | 3.83 | 9.74 | 4.08 | 8.59 | 2.52 | 6.92 |
| + TT | 9.26 | 11.95 | 6.07 | 8.34 | 3.35 | 3.57 |
| + ordering + TT | 3.83 | 9.72 | 3.79 | 6.92 | 2.16 | 3.86 |
| + ordering + TT + null-move | 3.83 | 9.72 | 3.79 | 5.14 | 2.11 | 2.87 |
| + ordering + TT + quiescence | 4.07 | 6.97 | 3.08 | 5.58 | 2.74 | 3.68 |
| Everything | 4.07 | 6.97 | 3.08 | 3.85 | 3.48 | 2.78 |

Plain minimax pays the full branching factor of chess, 24–27 in these positions (its later columns
average only the small endgames it could finish). With ordering, the table and null-move, a ply
costs 2–5 times more from depth 4 on — the neighbourhood of √b, which is what alpha-beta with
perfect ordering would give.

The alternating pattern — alpha-beta at 9.3, 12.0, 6.8, 10.5 — is the odd–even effect. The
smallest tree alpha-beta can search to depth d has about b^⌈d/2⌉ + b^⌊d/2⌋ leaves, so a ply that
raises ⌈d/2⌉ (going to an odd depth) multiplies the work by about b/2, and the next one only about
doubles it.

### 3.4 Same answer, less work

For every position and depth where plain minimax finished (79 searches), the other configurations
were compared with it:

| Configuration | Same score | Same move |
|---|---:|---:|
| Alpha-beta | 79/79 | 79/79 |
| + MVV-LVA ordering | 79/79 | 79/79 |
| + TT | 79/79 | 79/79 |
| + ordering + TT | 79/79 | 79/79 |
| + ordering + TT + null-move | 79/79 | 79/79 |
| + ordering + TT + quiescence | 31/79 | 52/79 |
| Everything | 31/79 | 52/79 |

Alpha-beta, ordering and the transposition table return exactly minimax's score and move in all
79 — the equivalence teaching mode claims. With the four-ply guard, null-move pruning also agreed
in all 79 here, although nothing guarantees it will. Quiescence answers a different question: it
keeps searching captures past the fixed depth, so its scores differ in most positions (31/79 the
same) and its move in a third of them. That is the point of it.

### 3.5 Speed per node

| Configuration | Nodes/s |
|---|---:|
| Plain minimax | 365,774 |
| Alpha-beta | 269,905 |
| + MVV-LVA ordering | 158,380 |
| + TT | 251,989 |
| + ordering + TT | 147,974 |
| + ordering + TT + null-move | 143,435 |
| + ordering + TT + quiescence | 124,114 |
| Everything | 116,969 |

Fewer nodes is not the same as less time. Ordering costs over 40% of the speed per node — every
node sorts its moves — and is still by far the best trade: at depth 5 it cuts alpha-beta's nodes
by a median of 5×, from nothing in the pawn endgames to 89× on Kiwipete. The transposition table
costs about 7% per node; hashing is two 32-bit XORs per piece. On the start position at depth 5,
ordering and the table together take 0.28 s, against 0.42 s for alpha-beta alone and 15.0 s for
plain minimax.

### 3.6 How deep each configuration gets in 30 seconds

| Position | Plain minimax | Alpha-beta | + MVV-LVA ordering | + TT | + ordering + TT | + ordering + TT + null-move | + ordering + TT + quiescence | Everything |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Start position | 5 | 6 | 7 | 7 | 7 | 7 | 7 | 7 |
| Italian | 4 | 6 | 7 | 6 | 7 | 7 | 5 | 6 |
| Sicilian Najdorf | 4 | 5 | 6 | 6 | 6 | 6 | 5 | 5 |
| Queen's Gambit Declined | 4 | 6 | 6 | 6 | 6 | 6 | 7 | 7 |
| Kiwipete | 4 | 5 | 7 | 5 | 7 | 7 | 7 | 7 |
| Perft position 4 | 4 | 5 | 7 | 5 | 7 | 7 | 7 | 7 |
| Perft position 5 | 4 | 6 | 7 | 6 | 7 | 7 | 7 | 7 |
| Perft position 6 | 4 | 5 | 6 | 5 | 6 | 7 | 6 | 6 |
| Opera Game, mate in 2 | 4 | 6 | 7 | 6 | 7 | 7 | 7 | 7 |
| Win at Chess #1 | 4 | 6 | 7 | 6 | 7 | 7 | 7 | 7 |
| Win at Chess #4 | 4 | 7 | 7 | 7 | 7 | 7 | 7 | 7 |
| Suite FOAI-T.082 (Nd6) | 4 | 6 | 7 | 6 | 7 | 7 | 7 | 7 |
| Suite FOAI-T.085 (Bh3) | 5 | 6 | 7 | 7 | 7 | 7 | 7 | 7 |
| Rook endgame (perft 3) | 6 | 7 | 7 | 7 | 7 | 7 | 7 | 7 |
| Fine #70 (pawn endgame) | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 |
| King and pawn | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 |
| Queen vs rook | 5 | 7 | 7 | 7 | 7 | 7 | 7 | 7 |

### 3.7 Tactics

The first depth at which each configuration plays the known best move, and how long that search
took:

| Position | Plain minimax | Alpha-beta | + MVV-LVA ordering | + TT | + ordering + TT | + ordering + TT + null-move | + ordering + TT + quiescence | Everything |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Opera Game, mate in 2 | d4 (4.1 s) | d4 (235 ms) | d4 (41 ms) | d4 (218 ms) | d4 (36 ms) | d4 (44 ms) | d4 (102 ms) | d4 (98 ms) |
| Win at Chess #1 | d4 (9.1 s) | d4 (274 ms) | d4 (130 ms) | d4 (269 ms) | d4 (101 ms) | d4 (128 ms) | d4 (324 ms) | d4 (298 ms) |
| Win at Chess #4 | d4 (4.0 s) | d4 (38 ms) | d4 (16 ms) | d4 (31 ms) | d4 (14 ms) | d4 (13 ms) | d4 (54 ms) | d4 (54 ms) |
| Suite FOAI-T.082 (Nd6) | d4 (2.4 s) | d4 (268 ms) | d4 (87 ms) | d4 (245 ms) | d4 (94 ms) | d4 (73 ms) | d3 (45 ms) | d3 (44 ms) |
| Suite FOAI-T.085 (Bh3) | — | — | d7 (2.6 s) | d7 (22.6 s) | d7 (1.6 s) | d7 (1.2 s) | d5 (208 ms) | d5 (162 ms) |
| Fine #70 (pawn endgame) | — | — | — | — | — | — | — | — |

Every configuration that reaches depth 4 finds the three mates in two, since a mate in two is four
plies; the difference is only time — 9.1 s for plain minimax on WAC #1, 0.1 s with ordering and
the table. FOAI-T.085 is where quiescence earns its cost: the bishop on g4 is attacked, and 1.Bh3
is the one retreat that keeps guarding the knight on d7. Every other move drops material to a
capture a few plies later, which quiescence finds at depth 5 and the fixed-depth search only at
depth 7. Fine #70 (1.Kb1, a classic transposition-table test whose winning idea lies twenty-odd plies
deep) is out of reach of a depth-7 fixed search in any configuration; §4.2 shows the game search
on it.

---

## 4. The game search

### 4.1 Null-move pruning

Null-move pruning lets the side to move pass. If the opponent, moving twice and searched two plies
shallower, still cannot bring the score below beta, a real move would not either, and the node is
cut without searching one. Its risk is zugzwang, where passing would be best; the search does not
try it with only king and pawns, in check, twice in a row, or near mate scores.

The first version tried a null move whenever more than two plies remained, so the reduced search
could land straight in quiescence. On Win at Chess #1 (1.Qg6! gxf6 2.Qh7#) that search, looking
at captures only, cannot see the quiet threat Qh7#; it cut Black's replies to 1.Qg6 and the engine
played 1.Ne8 instead, needing depth 6 to find the mate that it found at depth 4 without
null-move. Requiring at least four plies at the node keeps every null search one full ply deep,
and the mate reappears at depth 4.

Whether that guard costs strength was settled by games. Each match below is 80 games at 300 ms a
move: the 40 book openings of `bench/openings.js`, each played once with each colour.

| Match (first engine's result) | + | = | − | Score | Elo difference (95% interval) |
|---|---:|---:|---:|---:|---:|
| Null-move, guard 3 plies, vs no null-move | 49 | 11 | 20 | 68.1% | +132 (+61 to +215) |
| Null-move, guard 4 plies, vs guard 3 plies | 28 | 17 | 35 | 45.6% | −30 (−100 to +37) |

Null-move pruning is worth well over a hundred Elo; the stricter guard's cost is inside the noise.
On the 105-position tactical suite the two guards are equally good (below). The engine uses the
four-ply guard: no measurable price, and it no longer misses a mate in two it has time to see.

**Tactical suite.** None of the classic suites (WAC, ECM) could be downloaded in this environment,
so `bench/make-tactics.js` builds one the same way: weak Stockfish games from the book openings,
every position screened by Stockfish at depth 8, promising ones confirmed at depth 16, and a
position kept only when its best move is at least 150 cp better than the runner-up (or mates in
three when nothing else does) and the position is not already decided. Plain recaptures are
dropped as too easy. The result, 105 positions with one clearly best move, is in
`bench/positions/tactics.epd`.

Positions solved (the engine's move is the best move) at a fixed time per position, and the mean
depth reached:

| Build | 0.2 s | 1 s | 5 s | Mean depth at 0.2 / 1 / 5 s |
|---|---:|---:|---:|---:|
| Final engine | 78 | 88 | 94 | 4.53 / 5.83 / 7.27 |
| Final engine, null-move off | 79 | 88 | 93 | 4.50 / 5.76 / 6.81 |
| Before this iteration (unbounded table, no null-move) | 77 | 88 | 93 | 4.50 / 5.71 / 6.79 |

(Out of 105. An earlier run at 1 s gave 88 and 87 for the 3- and 4-ply null-move guards.)

The suite separates the builds far less than games do. Most of its positions are "only moves"
that any search deep enough to see the material finds, so time is what matters: from 78 to 94
solved as the budget goes from 0.2 to 5 seconds. Null-move buys about half a ply at 5 s
(7.27 against 6.81) and one more position solved, while at 0.2 s it is one behind — noise at the
scale of this suite. Its value shows in games: the +132 Elo above. The positions no build solves
need more than seven plies.

### 4.2 The fixed-size transposition table

The table was a JavaScript `Map` keyed by a `BigInt` hash, which grew for as long as a session ran.
It is now seven parallel typed arrays allocated once — about 10 MB for 2^19 slots — addressed by
the low bits of a 64-bit key held as two 32-bit halves and verified against all 64 bits. When two
positions want one slot, the same position is always refreshed, an entry from an earlier search
always gives way, and within one search the deeper result stays.

Because its memory can no longer grow, the game keeps one table for the whole match, and each
search starts from what the previous one learned. It is cleared when the engine's side or its
contempt changes, since both alter what a stored draw score means. Mate scores are stored relative
to the node and converted back by ply, so a mate found on one path reads correctly on another.
The old table stored them as they came, which is only right if a position is always reached at
the same ply.

**A bug the fixed size exposed.** The Zobrist keys came from a linear congruential generator,
whose low bits are nearly periodic — bit 0 simply alternates. The `Map` keyed on the whole hash
and never noticed; the fixed-size table picks its slot by exactly those low bits. Every key's low
half shared the same bit 0, so one slot in two could never be used: a 256-slot table filled to
50% and stayed there. The keys now come from Mulberry32, a small generator with well-mixed low
bits, and a test walks 9,322 positions and requires every slot of a small table to be hit (it
fails on the old generator). At the shipped size the flaw cost little, because a two-second search
stores far fewer positions than there are slots: on three positions the fix changed node counts
by 0.1–3%, in both directions, with the same moves.

In teaching mode the new table is invisible, as it should be: on the start position at depth 5,
alpha-beta with ordering and the table searches 58,390 nodes against the `Map`'s 58,356 — 0.06%
more, from the rare slot where a deeper entry was kept — with the same move and score.

Table size against search effort, at fixed depth:

| Position | Depth | 2^8 slots | 2^12 slots | 2^16 slots | 2^19 slots | 2^22 slots |
|---|---:|---:|---:|---:|---:|---:|
| Start position | 7 | 2,143,841 (13.2 s, b1c3) | 1,341,275 (7.9 s, b1c3) | 953,394 (5.8 s, b1c3) | 920,884 (5.8 s, b1c3) | 905,827 (5.8 s, b1c3) |
| Kiwipete | 6 | 962,788 (9.7 s, e2a6) | 720,616 (7.3 s, e2a6) | 613,945 (5.8 s, e2a6) | 603,633 (6.0 s, e2a6) | 601,854 (6.2 s, e2a6) |
| Perft position 6 | 6 | 1,057,614 (13.8 s, c3d5) | 924,659 (12.0 s, c3d5) | 833,666 (11.1 s, c3d5) | 805,468 (10.5 s, c3d5) | 804,559 (10.6 s, c3d5) |

| Fine #70 | 2^1 slots | 2^8 slots | 2^12 slots | 2^16 slots | 2^19 slots | 2^22 slots |
|---|---:|---:|---:|---:|---:|---:|
| First 1.Kb1 | not within 60 s (depth 16) | Kb1 at depth 20: 3,553,306 nodes, 14.1 s | Kb1 at depth 19: 102,476 nodes, 0.4 s | Kb1 at depth 21: 104,555 nodes, 0.5 s | Kb1 at depth 27: 760,939 nodes, 3.7 s | Kb1 at depth 26: 489,194 nodes, 2.6 s |

Memory per slot is 19 bytes, so the columns are 5 KB, 78 KB, 1.2 MB, 10 MB and 80 MB.

- **The shipped size sits on the flat part of the curve.** 2^19 slots (10 MB) is within 0.1–1.7%
  of eight times the memory; 2^16 (1.2 MB) is already within about 5%. Below that the cost climbs: a
  256-slot table needs 2.3 times the shipped table's nodes on the start position at depth 7.
- **A table can be the difference between solving and not.** Fine #70's 1.Kb1 wins because White's
  king can break through, but only a search about twenty plies deep sees it. With an effectively
  empty table (two slots) the engine does not get past depth 16 in a minute; with any real table
  it plays 1.Kb1 within 0.4–14 s. The many move orders of the king manoeuvres collapse into far
  fewer positions, and results found deeper are reused at shallower nodes.
- **Which depth it appears at is not monotonic in the size** (19–27). That reuse of deeper results
  — "grafting" — is exactly what makes the depth at which a table-driven search sees something
  depend on which entries happened to survive. It is the same effect that makes Fine #70 solvable
  at all.

### 4.3 Contempt

A draw found inside the search — a repetition, a stalemate, the fifty-move rule — is worth
−contempt to the engine and +contempt to its opponent. The setting runs from −100 cp (the engine
seeks draws) to +100 cp (it avoids them) in the New game dialog, and defaults to 0, the old
behaviour. The tests pin the behaviour down on positions where the choice is stark:

- After 1.Nf3 Nf6 2.Ng1, Black can return to the start position with 2…Ng8. At contempt −300 the
  engine plays it and scores the position +3.00; at +300 it plays anything else.
- With a lone queen against a cornered king, 1.Qb6 or 1.Qc7 stalemates. At contempt −2000 the
  engine stalemates on purpose and reports +20.00; at 0 it keeps the queen and the win.

Contempt changes the score of draws only, so it has no cost in positions where no draw is in
reach. It is not a strength setting: it makes the engine take more risk (or less) to avoid (or
reach) a draw, which is worth doing against a weaker opponent and costly against a stronger one.

### 4.4 Before and after

The engine as it stood before this iteration (commit `5475e29`: an unbounded `Map` table, no
null-move, no contempt) against the final one, 80 games at 300 ms a move over the same 40
openings with both colours:

| Match (final engine's result) | + | = | − | Score | Elo difference (95% interval) |
|---|---:|---:|---:|---:|---:|
| Final engine vs the engine before this iteration | 42 | 17 | 21 | 63.1% | +93 (+27 to +168) |

The final engine searched 6.41 plies deep on average against 5.83 — the half ply that null-move
pruning and a table carried from move to move buy at this time control. On the tactical suite
(§4.1) the two are level at 1 second and one position apart at 5. The gain shows in games, where
the extra depth applies to every move, rather than in single positions chosen for one sharp idea.

The +93 is smaller than null-move's +132 against the final engine with null-move switched off.
The two numbers come from different pairs of engines and their intervals overlap widely
(+27 to +168 and +61 to +215), so the difference should not be read as a cost of the other
changes.

---

## 5. Playing strength

### 5.1 Method

The reference engine is Stockfish 19 (the single-threaded WASM build of the `stockfish` npm
package) with `UCI_LimitStrength` on. Its `UCI_Elo` setting, from 1320 to 3190, is calibrated by
the Stockfish developers against rated engines on the CCRL scale, which makes it a widely used,
freely available reference of known strength.

- Both engines get the same fixed time per move: 1 second. (The site gives the engine 2 seconds
  untimed.)
- Each opponent plays 32 games: the first 16 book openings, each once with each colour.
- A game ends by the rules — checkmate, stalemate, threefold repetition, fifty moves, insufficient
  material — adjudicated by this project's own rules code, exactly as in the app; games still
  going at 300 plies are drawn.
- FOAI keeps its transposition table through a game, as in the app, and sees the game's history
  for repetitions; Stockfish receives the whole game as a move list.
- The games were played by the build just before the Zobrist-key fix of §4.2. At the shipped
  table size that fix moves node counts by at most 3%, either way, with the same moves, so the
  result stands for the engine as shipped.
- The rating is the maximum-likelihood estimate from all games together, with a 95% interval from
  the curvature of the log-likelihood; per opponent, the Elo difference is −400·log10(1/score − 1).

A pilot of 6 games against `UCI_Elo` 1320, the lowest setting, was won 6–0, so the benchmark uses
1500, 1700, 1900 and 2100.

### 5.2 Results

128 games, 54 minutes on four cores. Scores are FOAI's; the Elo difference is FOAI minus the
anchor, and "implied rating" adds it to the anchor.

| Opponent | Games | + | = | − | Score | Elo difference (95%) | Implied rating (95%) | FOAI mean depth |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Stockfish, UCI_Elo 1320 (pilot¹) | 6 | 6 | 0 | 0 | 100% | — | above 1320 | 6.39 |
| Stockfish, UCI_Elo 1500 | 32 | 21 | 0 | 11 | 65.6% | +112 (−6 to +264) | 1612 (1494–1764) | 6.34 |
| Stockfish, UCI_Elo 1700 | 32 | 11 | 0 | 21 | 34.4% | −112 (−264 to +6) | 1588 (1436–1706) | 6.39 |
| Stockfish, UCI_Elo 1900 | 32 | 9 | 1 | 22 | 29.7% | −150 (−313 to −33) | 1750 (1587–1867) | 6.46 |
| Stockfish, UCI_Elo 2100 | 32 | 8 | 2 | 22 | 28.1% | −163 (−328 to −48) | 1937 (1772–2052) | 6.65 |

¹ The pilot ran before the null-move guard was raised from 3 to 4 plies (§4.1); it only chose the
anchors and is not in the pooled estimate unless stated.

- **Pooled maximum-likelihood rating: 1697 ± 72** (95%) on Stockfish's UCI_Elo scale; adding the
  six pilot games changes it to 1701 ± 71.
- **From the two anchors that bracket it: 1600 ± 89.** FOAI beats 1500 by exactly as much as it
  loses to 1700.
- Colour made no difference: 25 points from 64 games as White, 25½ from 64 as Black.
- 125 of the 128 games ended in checkmate; there were three draws (a repetition, the fifty-move
  rule, and one game reaching the 300-ply limit). FOAI searched 6.3–6.7 plies deep on average.
- All 128 games are in `bench/results/elo.pgn`.

### 5.3 How far to trust it

The two estimates disagree because the results do not follow a single logistic curve. At a rating
of 1697, FOAI should score about 76%, 50%, 24% and 9% against the four anchors; it scored 66%,
34%, 30% and 28%. The stronger anchors lose to it far more often than their ratings say they
should — the rating implied by each anchor climbs from about 1600 to about 1940 as the anchor gets
stronger.

That is what Stockfish's strength limiter would be expected to do against an engine like this one.
It does not play like a weaker engine; it plays like Stockfish that, now and then, deliberately
picks a worse move from its candidates, more often at lower settings. Against an opponent that
converts such gifts reliably at six or seven plies of search, even the 2100 setting hands over
enough games to lose more than a quarter of them. The scale was calibrated against other engines,
not against this kind of opponent at one second a move.

So the honest statement is a range: **about 1600–1700 on Stockfish's limited-strength scale at
1 second a move**, with 1600 the better-supported end, because the two anchors that bracket FOAI's
strength agree on it and the model fits them. The ± figures above are statistical only; they do not
include the misfit, and they should not be read as more precise than that. The number is also
specific to this time control: the site gives the engine 2 seconds, which is worth roughly half a
ply more.

---

## 6. Killer moves and the history heuristic

§3 showed that move ordering is what turns alpha-beta's theoretical saving into a real one. Until
this iteration, though, the game search ordered only the hash move, captures and promotions. Every
quiet move — most moves in most positions — came in whatever order the generator produced. Two
standard heuristics fill that gap, and both learn while the search runs:

- **Killer moves.** The last two quiet moves that caused a beta cutoff at each ply. A move that
  refuted one position is likely to refute its siblings, which differ only by the move just before.
- **History heuristic.** A table `history[side][from][to]` that gains `depth²` every time a quiet
  move causes a cutoff anywhere in the tree, so deep (expensive) refutations count for most. When an
  entry passes 60,000 the whole table is halved, which keeps it below the killers and lets it forget.

The order is now: hash move; captures and promotions by MVV-LVA; killer 1; killer 2; every other
quiet move by its history score. Teaching mode's search is untouched: its "MVV-LVA ordering"
technique is exactly what §3 measured.

### 6.1 Nodes to a fixed depth

`bench/nodes.js` searches §3's 17 positions to depth 7 with the game search (fresh table, no game
history), so the counts are exact and repeatable. With both heuristics switched off, the new code
searches **the same tree as the old one, node for node** (14,202,273 nodes in all), which shows the
rewritten ordering changed nothing else.

| Position | Before | Killers only | History only | Both | Both / before |
|---|---:|---:|---:|---:|---:|
| Start position | 920,884 | 371,495 | 532,150 | 356,261 | 0.39 |
| Italian | 2,179,115 | 831,398 | 767,532 | 735,237 | 0.34 |
| Sicilian Najdorf | 4,413,212 | 1,718,929 | 1,833,715 | 1,662,083 | 0.38 |
| Queen's Gambit Declined | 1,935,549 | 1,372,082 | 1,316,168 | 1,307,206 | 0.68 |
| Kiwipete | 1,906,834 | 1,898,981 | 1,898,913 | 1,897,085 | 0.99 |
| Perft position 4 | 354,383 | 347,090 | 347,552 | 348,905 | 0.98 |
| Perft position 5 | 466,530 | 434,900 | 419,115 | 429,779 | 0.92 |
| Perft position 6 | 1,573,677 | 1,036,644 | 1,180,513 | 1,026,102 | 0.65 |
| Opera Game, mate in 2 | 11,927 | 11,735 | 11,788 | 11,708 | 0.98 |
| Win at Chess #1 | 34,836 | 33,157 | 33,087 | 33,076 | 0.95 |
| Win at Chess #4 | 11,013 | 11,013 | 11,012 | 11,012 | 1.00 |
| Suite FOAI-T.082 (Nd6) | 143,977 | 145,710 | 146,010 | 145,838 | 1.01 |
| Suite FOAI-T.085 (Bh3) | 157,218 | 137,944 | 130,672 | 127,350 | 0.81 |
| Rook endgame (perft 3) | 46,450 | 37,079 | 36,987 | 36,959 | 0.80 |
| Fine #70 (pawn endgame) | 1,317 | 1,355 | 1,379 | 1,338 | 1.02 |
| King and pawn | 7,674 | 7,220 | 7,636 | 6,894 | 0.90 |
| Queen vs rook | 37,677 | 37,538 | 34,798 | 35,572 | 0.94 |
| **All 17** | **14,202,273** | **8,434,270** | **8,709,027** | **8,172,405** | **0.58** |
| Geometric mean of the ratio to before | | 0.78 | 0.80 | 0.76 | |

- **42% fewer nodes overall, and the same best move in all 17 positions.** Each heuristic alone gets
  most of the saving (22% and 20% by geometric mean); they overlap, so together they add only a
  little more (24%).
- **The saving is in quiet positions.** Three of the four openings need 61–66% fewer nodes (the
  Queen's Gambit Declined 32%), and the quiet middlegame of perft position 6 35%. In
  Kiwipete, Win at Chess #4 and the forced mates almost nothing changes: there the captures
  and the hash move already decide the order, and quiet moves rarely matter.
- **Nodes got no dearer.** Scores are now worked out once per move rather than inside the sort's
  comparator; with both heuristics off that alone is 2% faster per node (160k → 163k per second), and
  the smaller tree runs at 177k.

### 6.2 In games

80 games at 300 ms a move against the engine this iteration started from: **+34 =22 −24 (56.3%),
+44 Elo (95% interval −21 to +111)**, searching 7.05 plies deep on average. The direction is clear,
but 80 games cannot tell +44 from zero; the node counts above are the firmer evidence.

---

## 7. A tapered evaluation

The evaluation of §1 used one set of numbers for the whole game. Its king table, for instance,
rewards a king tucked behind its pawns on g1 and punishes one on e4 by 70 centipawns. That is right
with the queens on, and wrong in a king-and-pawn ending, where the king belongs in the centre. One
table cannot be right in both.

Every weight now has two values, one for the middlegame (mg) and one for the endgame (eg), and the
evaluation blends them by the **game phase**: each knight or bishop counts 1, each rook 2 and each
queen 4, so the phase is 24 at the start and 0 with only kings and pawns. A term contributes

    (mg · phase + eg · (24 − phase)) / 24

so it slides from one value to the other as pieces come off, with no abrupt switch at an arbitrary
"endgame" threshold. Teaching mode's evaluation breakdown now shows the phase it blended at.

The same pass added the patterns the old evaluation could not see:

| Term | Counted as |
|---|---|
| Passed pawn | Per pawn with no enemy pawn ahead of it on its own or a neighbouring file, by how far it has advanced (6 values per phase) |
| Bishop pair | Two or more bishops |
| Rook on an open / half-open file | No pawns on the file / only enemy pawns |
| Mobility | Per square a knight, bishop or rook can move to (empty, or holding an enemy piece) |

Mobility changed meaning on the way. The old knight term counted the knight's squares from a fixed
per-square table, which made it part of the knight's piece-square table under another name. It now
counts the squares the knight can actually move to, and the same goes for bishops and the new rook
term.

Two implementation details matter for what follows:

- **Black reads the tables mirrored, not rotated.** The old code looked up Black's square as
  `63 − sq`, which flips the board top to bottom *and* left to right. That was harmless only because
  every hand-written table was left-right symmetric. A fitted table need not be, so Black now uses
  `sq ^ 56`, a pure top-to-bottom mirror. The colour-symmetry test, now also run on 300 random
  positions, would catch the old form as soon as a table became asymmetric.
- **Each term is rounded on its own**, towards zero, so the breakdown still adds up exactly to the
  score and a colour-flipped position still scores exactly the negative.

Before any tuning, the endgame values were set by hand: the same as the middlegame values except for
a centralising king table, a larger passed-pawn bonus, and no king-shelter terms. The richer
evaluation costs about 12% of search speed (169k → 148k nodes per second on five positions), and at
300 ms a move the engine searched 6.4 plies on average instead of 7.05. **It is still the largest
gain of this iteration: +61 =7 −12 (80.6%) against the engine of §6, +248 Elo (95% interval +169 to
+357).**

---

## 8. Texel tuning: learning the evaluation from games

Every number in §7 was still chosen by hand. Texel tuning, named after Peter Österlund's engine
Texel where it was introduced in 2014, replaces those guesses with values fitted to game results. It
is the machine-learning part of this project, and a textbook case: a linear model, a logistic link,
and a loss minimised by gradient descent.

### 8.1 The model

The evaluation is linear in its weights. For a position *i*, `Evaluation.features()` lists how often
each pattern occurs, as White's count minus Black's — one knight more, a knight on f3, two doubled
pawns fewer, eleven more squares of bishop mobility — and the score is

    q_i = Σ_j φ_ij · (mg_j · phase_i + eg_j · (24 − phase_i)) / 24

over ~800 weights (mg_j, eg_j). A score becomes a predicted result through the logistic curve chess
programmers already use to relate centipawns to winning chances,

    σ(q) = 1 / (1 + 10^(−K·q/400))

and the weights minimise the mean squared error between that prediction and the result R_i of the
game the position came from (1, ½ or 0, from White's side):

    E = 1/N Σ_i (R_i − σ(q_i))²

With the features fixed, this is logistic regression with a squared-error loss. K is fitted first,
to the hand-set weights (K = 0.846), and then held fixed. That pins the scale, so a pawn stays worth
about a hundred and contempt and the mate thresholds keep their meaning. A test checks that
`features()` and the weights reproduce `evaluate()` on 407 positions to within the rounding of the
five terms, so the tuner fits exactly the function the engine uses.

### 8.2 The data

As in Österlund's original, the training games are the engine's own (`bench/datagen.js`): the §7
engine with hand-set weights, playing itself at 40 ms a move. Each game starts from one of the forty
book openings followed by 2–8 random moves, so no two games are alike; openings the random moves
left more than two pawns out of balance are discarded. A game is adjudicated as won once the score
has stayed beyond ±10 pawns for 6 plies, and as drawn at 400 plies.

Only **quiet** positions are kept — the side to move is not in check, and the move the engine chose
is not a capture or a promotion — because a static evaluation cannot judge a position in the middle
of an exchange. Positions where the search had already found a mate are dropped too.

About 100 minutes on three cores produced **3,941 games and 257,691 positions**, 65 per game (White
won 45% of the games, Black 45%, 10% were drawn), with 19.4 nonzero features each. Featurising all
of them takes 3 seconds; an epoch over the training set then takes 40 ms.

### 8.3 Fitting without fooling ourselves

The first fit went wrong in an instructive way. Split at random by position, the held-out error fell
almost as fast as the training error. But neighbouring positions of one game are near copies with the
same result, so a random split tests the model on what it was trained on. Split **by game**, the
held-out error rose from the first epoch: with a few hundred games and ~800 weights, the fit was
memorising games.

The final procedure:

- **Whole games are held out**: every tenth game for validation, and another tenth as a test set.
  The validation games choose the stopping epoch and the model; the test games are never used for
  any choice, so their error is the honest measure.
- **Early stopping**: full-batch Adam, keeping the weights with the lowest validation error.
- **Piece-square tables tied left to right** (a-file with h-file, and so on), halving their
  parameters.
- After fitting, each piece-square table's average is moved into its piece's value. The fit cannot
  tell the two apart — they only enter the score as a sum — so this changes no evaluation, and it
  keeps the piece values meaning what they say.

Three candidate models were compared on the validation games (mean squared error; the hand-set
weights score 0.14290 on validation and 0.14098 on test):

| Fitted | Weights fitted | Best epoch | Train | Validation | Test |
|---|---:|---:|---:|---:|---:|
| Nothing (hand-set) | 0 | — | 0.13837 | 0.14290 | 0.14098 |
| Everything | ~800 | 25 | 0.13459 | 0.14083 | 0.13992 |
| Everything but the piece-square tables, with L2 towards the hand-set values (λ = 10⁻⁶) | 44 | 25 | 0.13738 | 0.14196 | 0.14040 |
| **Everything but the piece-square tables** | **44** | **125** | **0.13585** | **0.14048** | **0.13946** |

The full model fits the training games best and the held-out games worse: its 768 piece-square
entries give it room to memorise. Fitting the 44 scalar weights alone — piece values, pawn
structure, king safety, mobility, rooks and the bishop pair, each with a middlegame and an endgame
value — generalises best, and that is the model the engine ships with. It lowers the test error by
1.1%. That sounds small, but it is measured on game results, which no evaluation can predict well
from a single position.

The learning curve of the chosen fit shows the overfitting that early stopping guards against:

| Epoch | 0 | 25 | 50 | 125 | 250 | 500 | 1000 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Train | 0.13837 | 0.13699 | 0.13651 | 0.13584 | 0.13536 | 0.13488 | 0.13456 |
| Validation | 0.14290 | 0.14135 | 0.14089 | **0.14055** | 0.14071 | 0.14119 | 0.14200 |

Two other tries on a 188k-position subset are worth recording because they failed. Plain gradient
descent with momentum, which moves a rarely seen weight more slowly than a common one, did not stop
the full model overfitting. An L2 penalty pulling all ~800 weights towards their hand-set values
only made the validation error worse than not tuning at all. With 3,941 games, the information is
simply not there for 768 piece-square entries.

### 8.4 What the games said

The hand-set column is after the same averaging step, which is why the pawn shows 114 rather than
100 (the pawn table averages +14).

| Weight | Middlegame, hand-set | Middlegame, learned | Endgame, hand-set | Endgame, learned |
|---|---:|---:|---:|---:|
| Pawn | 114 | 103 | 114 | 130 |
| Knight | 307 | 294 | 307 | 283 |
| Bishop | 328 | 298 | 328 | 297 |
| Rook | 500 | 443 | 500 | 466 |
| Queen | 897 | 950 | 897 | 952 |
| Bishop pair | 30 | 15 | 50 | 19 |
| Doubled pawn | −15 | −13 | −15 | −20 |
| Isolated pawn | −20 | −1 | −20 | −15 |
| Rook, open file | 20 | 39 | 10 | −9 |
| Rook, half-open file | 10 | 19 | 5 | 23 |
| King file without own pawn | −30 | −10 | 0 | 43 |
| …and without any pawn | −20 | −58 | 0 | −49 |
| Shield pawn (king castled wide) | 10 | 12 | 0 | −18 |
| Mobility, knight (per square) | 2 | −2 | 2 | −1 |
| Mobility, bishop (per square) | 2 | 4 | 2 | 2 |
| Mobility, rook (per square) | 1 | 1 | 2 | 8 |
| Passed pawn on rank 2 | 5 | −2 | 10 | 5 |
| Passed pawn on rank 3 | 10 | −19 | 20 | 26 |
| Passed pawn on rank 4 | 15 | −18 | 35 | 41 |
| Passed pawn on rank 5 | 25 | −29 | 60 | 94 |
| Passed pawn on rank 6 | 40 | 74 | 90 | 132 |
| Passed pawn on rank 7 | 60 | 7 | 130 | 179 |

Some of this is chess knowledge the data rediscovered:

- **Passed pawns** in the endgame are worth more, and grow faster with every rank, than the
  hand-set guesses: 5, 26, 41, 94, 132, 179.
- **The queen** is worth more than 900, and **the rook** less than 500 in the middlegame.
- **The bishop pair** is worth less than the folklore figure at this level of play.

Some of it is the data's own view and should not be read as chess truth. The middlegame passed-pawn
values for ranks 3–5 come out negative, for example. In these games an advanced pawn in the
middlegame is often an overextended one, and the pawn table already pays for advancing. The fit
answers "what predicted the result of *these* games", which is the right question for this engine
but not a general one.

### 8.5 In games

80 games at 300 ms a move, tuned against hand-set weights, everything else identical: **+42 =14 −24
(61.3%), +80 Elo (95% interval +11 to +155)**. The interval excludes zero: the learned weights play
measurably better than the hand-set ones, and the 1.1% lower prediction error turns into games won.

---

## 9. Where this leaves the engine

### 9.1 Self-play, step by step

All at 300 ms a move, 80 games (each of 40 openings with both colours), Elo from the score:

| Engine | Opponent | + | = | − | Score | Elo (95% interval) | Mean depth |
|---|---|---:|---:|---:|---:|---:|---:|
| Killers + history (§6) | Engine before this iteration | 34 | 22 | 24 | 56.3% | +44 (−21 to +111) | 7.05 |
| + tapered evaluation, hand-set (§7) | Killers + history | 61 | 7 | 12 | 80.6% | +248 (+169 to +357) | 6.40 |
| + Texel-tuned weights (§8) | Hand-set weights | 42 | 14 | 24 | 61.3% | +80 (+11 to +155) | 6.50 |
| **Final engine** | **Engine before this iteration** | **53** | **12** | **15** | **73.8%** | **+179 (+108 to +268)** | **6.36** |

The steps add up to about +370; the direct match gives +179 (95% interval +108 to +268).
Self-play between versions of one engine exaggerates differences, which is why the calibrated
benchmark below matters.

### 9.2 Tactics

The 105-position suite of §4.1, at 1 second a position, both engines run side by side in this
session (`bench/results/tactics-1s.txt`):

| Engine | Solved at 1 s | Mean depth |
|---|---:|---:|
| Before this iteration | 88 | 6.24 |
| Final | **94** | 6.30 |

At 1 second the final engine solves as many positions as the September engine did with 5 seconds
(§4.1). It reaches about the same depth: the slower evaluation spends what the better ordering
saves. So the six extra positions come from better choices at the same depth, not from searching
deeper.

### 9.3 Playing strength against Stockfish

The benchmark of §5, repeated for the final engine: Stockfish 19 with `UCI_LimitStrength`, 1 second
a move, 32 games against each of four settings (the first 16 openings, each with both colours). The
settings are 200 points higher than September's, to bracket the stronger engine. 128 games took 56
minutes on four cores; all are in `bench/results/elo-final.pgn`.

| Opponent | Games | + | = | − | Score | Elo difference (95%) | Implied rating (95%) | FOAI mean depth |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Stockfish, UCI_Elo 1700 | 32 | 19 | 2 | 11 | 62.5% | +89 (−26 to +227) | 1789 (1674–1927) | 7.03 |
| Stockfish, UCI_Elo 1900 | 32 | 17 | 2 | 13 | 56.3% | +44 (−73 to +172) | 1944 (1827–2072) | 7.23 |
| Stockfish, UCI_Elo 2100 | 32 | 12 | 1 | 19 | 39.1% | −77 (−215 to +40) | 2023 (1885–2140) | 7.50 |
| Stockfish, UCI_Elo 2300 | 32 | 14 | 3 | 15 | 48.4% | −11 (−131 to +107) | 2289 (2169–2407) | 7.31 |

- **Pooled maximum-likelihood rating: 2015 ± 71** (95%). **From the two anchors that bracket it**
  (1900 and 2100): **1982 ± 89**.
- **The misfit of §5.3 is back, and stronger.** At 2015 the engine should score about 86%, 66%,
  38% and 16% against the four settings; it scored 62%, 56%, 39% and 48%. The 2300 setting lost
  half its games, three times what its rating implies. So the pooled figure depends on which
  settings are used, and higher settings push it up.
- **Like for like.** On the three settings both engines played (1700, 1900 and 2100), the September
  engine rates **1730 ± 82** and the final engine **1922 ± 77: +192**. That agrees with the +179 of
  the direct match (§9.1), which makes the gain the best-supported number in this section.
- Colour made no difference (33½ of 64 as White, 32½ of 64 as Black). 120 of the 128 games ended in
  checkmate. FOAI searched 7.0–7.5 plies on average, against 6.3–6.7 in September.

On the same terms as §5.3, the honest statement is a range: **about 1900–2000 on Stockfish's
limited-strength scale at 1 second a move, roughly 200 points above the September engine.**

### 9.4 One bug, found by the data generator

At 40 ms a move, freshly started worker threads sometimes ran out of time before depth 1 finished,
and the engine returned no move at all. The app has the same exposure in bullet with a nearly empty
clock: it ignores a result without a move, so the engine would sit until it lost on time. Depth 1
now always runs to completion (a few thousand nodes at most), and a test searches with no time left
and requires a move.

---

## 10. Limitations and next steps

- **Quiescence ignores checks.** A leaf in check is scored by standing pat, and a quiet mate at the
  horizon is invisible. This is what forced the null-move guard; searching check evasions in
  quiescence would remove the blind spot and probably allow the lighter guard.
- **The piece-square tables are still hand-set.** 3,941 games were not enough to fit their 768
  entries without memorising games (§8.3). More games — ideally at a longer time control, where
  results depend less on blunders — are the obvious next step; the generator and tuner are ready.
- **The training games are the engine's own.** The weights fit the positions this engine reaches
  and the mistakes it makes. A second round (new games with the tuned weights, then retuning) would
  show whether the gain compounds.
- **Self-play exaggerates.** Version-against-version gains add up to more than the direct match
  shows (§9.1); §9.3 is the calibrated figure.
- **No extensions.** Checks are not extended, so forcing lines are cut at the same depth as quiet
  ones.
- **Path-dependent table entries.** A draw score stored because one line repeated can be reused on
  a path where it did not. Most engines accept this; it is bounded by clearing the table when
  contempt or side changes.
- **The Elo figures have a scope.** One reference family, one time control, 128 games each
  (§5.3, §9.3).

---

## 11. Conclusion

In September the engine was correct where it can be checked exactly — perft on every standard
position, and alpha-beta, ordering and the table agreeing with plain minimax in every comparable
search — and measurably better than at the start of that iteration: +93 Elo against its former
self — most of it, on the evidence of §4.1, from null-move pruning — and about 1600–1700 on
Stockfish's calibrated scale at one second a move.

The experiments make the course's central point in numbers. Plain minimax pays the full branching
factor of chess, 24–27 per ply; alpha-beta alone brings that down to 7–12, and it is move
ordering that turns alpha-beta's theoretical saving into a real one (about 100× at depth 4). The
transposition table matters more with every ply and is what solves Fine #70 at all. Null-move
pruning is the one technique here that trades exactness for depth, and the experiments show both
sides of that trade: the depth it buys is worth over a hundred Elo in games, and a careless guard
misses a mate in two.

Two things went wrong on the way and were caught by measurement, not by inspection: the first
null-move guard's blind spot (a tactical position, then a self-play match to confirm the fix was
free), and the hash keys' weak low bits (a fill rate that did not add up). Both are now pinned by
tests. The limits of the September engine were no check handling in quiescence, no quiet-move
ordering and no extensions — each a known step with a known way to measure it.

The November round took the second of those and went further, into learning. The results follow
the course's arc: better ordering is a pure search gain (fewer nodes, same answers); a better
evaluation is worth more than the depth it costs; and the evaluation's weights can be learned
rather than guessed. The learning part showed the classic failure as clearly as the success. A
model with more parameters than its data can support fits the training games better and predicts
unseen games worse, and it took splitting by game rather than by position even to see that.
Fitting the 44 weights the data could support turned 1.1% better predictions into +80 Elo over the
hand-set values. Together the three changes make the engine +179 Elo stronger than in September
in a direct match, and about 1900–2000 on Stockfish's scale, roughly 200 points up. §10 lists what
remains.

---

## 12. Reproducing this report

```bash
npm ci
npm test && npm run test:deep                       # §2
npm install --no-save stockfish                     # for §4.1 suite generation and §5

node bench/experiments.js --max-depth 7 --limit 30  # §3 (≈ 12 min on 4 cores)
node bench/tables.js                                # §3 tables from bench/results/experiments.json
node bench/make-tactics.js --count 35 --out …       # §4.1 suite (random: a new run finds new positions)
node bench/suite.js --engine foai --movetime 1000   # §4.1 suite results (also 200, 5000;
                                                    #   foai:nullMove=false; foai@<dir> for older builds)
node bench/match.js --player foai:nullMinDepth=3 --opponents foai:nullMove=false --movetime 300    # §4.1
node bench/match.js --player foai:nullMinDepth=4 --opponents foai:nullMinDepth=3 --movetime 300   # §4.1
node bench/tt-size.js                               # §4.2
git worktree add ../foai-before 5475e29             # §4.4: the engine before this iteration
node bench/match.js --player foai --opponents foai@../foai-before/src/engine --movetime 300 \
  --out bench/results/before-after.json
node bench/match.js --player foai --opponents sf:1500,sf:1700,sf:1900,sf:2100 \
  --movetime 1000 --rounds 16 --out bench/results/elo.json --pgn bench/results/elo.pgn          # §5

# November (§6–9). Each stage is a commit, so each engine can be checked out on its own:
git worktree add ../foai-sept 73d165d               # the September engine
git worktree add ../foai-ordering 974a8b7           # §6: + killers and history
git worktree add ../foai-hand e0d5673               # §7: + tapered evaluation, hand-set weights
node bench/nodes.js --depth 7 --engines "base=foai@../foai-sept/src/engine,neither=foai:killers=false:history=false,\
killers=foai:history=false,history=foai:killers=false,both=foai"                               # §6.1
node bench/match.js --player foai@../foai-ordering/src/engine --opponents foai@../foai-sept/src/engine \
  --movetime 300                                                                                # §6.2
node bench/match.js --player foai@../foai-hand/src/engine --opponents foai@../foai-ordering/src/engine \
  --movetime 300                                                                                # §7
node bench/weights-file.js --hand                   # §8.2: the games are played by the hand-set engine…
node bench/datagen.js --minutes 100 --movetime 40 --workers 3   # → bench/data/selfplay.txt
node bench/tune.js --epochs 1000 --report …         # §8.3: all weights (starts from the hand-set values)
node bench/tune.js --epochs 1000 \
  --only pieceValue,doubled,isolated,passed,bishopPair,rookOpen,rookSemiOpen,kingFileOpen,kingFileBare,kingShield,mobility \
  --write --report bench/results/tuning.json        # §8: the shipped fit, written back to src/engine/weights.js
node bench/match.js --player foai --opponents foai@../foai-hand/src/engine --movetime 300       # §8.5
node bench/match.js --player foai --opponents foai@../foai-sept/src/engine --movetime 300       # §9.1
node bench/suite.js --engine foai --movetime 1000                                               # §9.2 (and foai@../foai-sept/src/engine)
node bench/match.js --player foai --opponents sf:1700,sf:1900,sf:2100,sf:2300 --movetime 1000 \
  --rounds 16 --log elo.jsonl --out bench/results/elo-final.json --pgn bench/results/elo-final.pgn   # §9.3 (resumable)
```

The self-play data (`bench/data/`, ~20 MB) is not committed. `bench/datagen.js` is seeded, but
games played to a time limit depend on machine speed, so a new run produces different games of
the same kind.

| File | Contents |
|---|---|
| `bench/results/experiments.json` | Every teaching-search run of §3: position, configuration, depth, nodes, time, move, score |
| `bench/results/elo.json`, `elo.pgn` | The 128 benchmark games of §5, with results and search depths |
| `bench/results/null-move-on-vs-off.txt` | The 80 games of the first null-move match |
| `bench/results/null-min-depth-4-vs-3.json` | The 80 games of the guard match |
| `bench/results/before-after.json` | The 80 games of §4.4 |
| `bench/positions/tactics.epd` | The tactical suite, with Stockfish's score and margin for each position |
| `bench/results/ordering-d7.json`, `ordering-d7.md` | §6.1: nodes to depth 7, five configurations, 17 positions |
| `bench/results/ordering-vs-before.json` | §6.2: 80 games, killers and history against the September engine |
| `bench/results/tapered-vs-ordering.json` | §7: 80 games, hand-set tapered evaluation against §6's engine |
| `bench/results/tuning.json` | §8: the shipped fit — data, K, errors, learning curve, starting and learned weights |
| `bench/results/tuning-candidates.json` | §8.3: the three candidate fits |
| `bench/results/tuned-vs-hand.json` | §8.5: 80 games, learned against hand-set weights |
| `bench/results/final-vs-before.json` | §9.1: 80 games, final engine against the September engine |
| `bench/results/tactics-1s.txt` | §9.2: tactical suite at 1 s, both engines |
| `bench/results/elo-final.json`, `elo-final.pgn` | §9.3: the 128 benchmark games of the final engine |
