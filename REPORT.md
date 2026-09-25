# FOAI Chess Engine — Final Report

*Foundations of Artificial Intelligence · course project · September 2026*

This report evaluates the engine behind the FOAI Chess Engine site: how correct it is, what each
search technique buys, what the final round of engine work changed, and how strong the result
plays. Every number here was measured for this report on one core of the same machine (Node 22,
Linux, 4 cores), and every script and raw result needed to reproduce it is in the repository
(§8).

## Summary

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
| Evaluation | Material, piece-square tables, pawn structure, king safety, mobility — in centipawns from White's side |
| Search | Negamax with alpha-beta, iterative deepening to a time budget, captures-only quiescence, MVV-LVA ordering with the hash move first |
| Transposition table | 64-bit Zobrist keys; fixed size (2^19 slots, ~10 MB); depth-preferred replacement with aging; kept for the whole game |
| Null-move pruning | R = 2, only with at least 4 plies left, never in check, twice in a row, near mate or with only king and pawns |
| Draws | Repetition (against the game's history and the current line), stalemate and the fifty-move rule, all scored with a configurable contempt |
| Teaching search | A separate fixed-depth search in which every technique can be switched off, to measure what each one costs |

What this final iteration added, against the plan in `future_implementations`:

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

## 6. Limitations and next steps

- **Quiescence ignores checks.** A leaf in check is scored by standing pat, and a quiet mate at the
  horizon is invisible. This is what forced the null-move guard; searching check evasions in
  quiescence would remove the blind spot and probably allow the lighter guard.
- **Move ordering stops at captures.** After the hash move, captures and promotions, quiet moves are
  searched in generation order. Killer moves and the history heuristic are the standard next step,
  and §3 shows how much ordering is worth.
- **No extensions.** Checks are not extended, so forcing lines are cut at the same depth as quiet
  ones.
- **Path-dependent table entries.** A draw score stored because one line repeated can be reused on
  a path where it did not. Most engines accept this; it is bounded by clearing the table when
  contempt or side changes.
- **The Elo figure has a scope.** One reference family, one time control, 128 games (§5.3).

---

## 7. Conclusion

The engine is correct where it can be checked exactly — perft on every standard position, and
alpha-beta, ordering and the table agreeing with plain minimax in every comparable search — and
measurably better than at the start of this iteration: +93 Elo against its former self — most of
it, on the evidence of §4.1, from null-move pruning — and about 1600–1700 on Stockfish's calibrated scale at one second a move.

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
tests. The limits of this engine are the ones in §6 — no check handling in quiescence, no quiet-
move ordering, no extensions — and each is a known step with a known way to measure it, using the
tools this iteration added.

---

## 8. Reproducing this report

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
```

| File | Contents |
|---|---|
| `bench/results/experiments.json` | Every teaching-search run of §3: position, configuration, depth, nodes, time, move, score |
| `bench/results/elo.json`, `elo.pgn` | The 128 benchmark games of §5, with results and search depths |
| `bench/results/null-move-on-vs-off.txt` | The 80 games of the first null-move match |
| `bench/results/null-min-depth-4-vs-3.json` | The 80 games of the guard match |
| `bench/results/before-after.json` | The 80 games of §4.4 |
| `bench/positions/tactics.epd` | The tactical suite, with Stockfish's score and margin for each position |
