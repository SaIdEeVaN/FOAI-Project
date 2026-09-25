// Web Worker — runs engine search off the main thread
import { Board } from './board.js';
import { SearchEngine } from './search.js';
import { TeachingSearch } from './teachingSearch.js';
import { MoveGenerator } from './moveGen.js';
import { TranspositionTable } from './transposition.js';
import { toSan, lineToSan } from './san.js';

// One transposition table for the whole game. Its size is fixed, so keeping it
// between moves costs nothing extra, and what one search learned helps the next.
// Draw scores depend on which side the engine plays and on its contempt, so the
// table starts afresh when either changes.
let gameTT = null;
let gameTTFor = null;

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === 'search') {
    const board = new Board();
    board.loadFrom(payload.boardState);
    const contempt = payload.contempt || 0;

    const owner = `${board.sideToMove} ${contempt}`;
    if (!gameTT) gameTT = new TranspositionTable();
    if (owner !== gameTTFor) { gameTT.clear(); gameTTFor = owner; }

    // The id is echoed back so the page can drop a search it has since abandoned.
    const { id } = payload;
    const engine = new SearchEngine(board, payload.positionHistory || [], { tt: gameTT, contempt });
    // Progress is reported between iterations, with the board back at the root.
    const { bestMove, depth, nodes, score } = engine.getBestMove(
      payload.timeLimitMs || 2000,
      (info) => self.postMessage({
        type: 'progress',
        payload: { id, ...info, san: info.move ? lineToSan(board, [info.move])[0] : null },
      })
    );

    self.postMessage({
      type: 'result',
      payload: {
        id,
        uci: bestMove ? bestMove.toUci() : null,
        san: bestMove ? toSan(board, bestMove) : null,
        depth,
        nodes,
        score,
        hashfull: gameTT.hashfull(),
      },
    });
  }

  // Teaching mode: one config after another, never in parallel — plain minimax
  // can run for tens of seconds. Each result is posted as soon as it lands.
  if (type === 'teach') {
    const { boardState, depth, configs, timeLimitMs } = payload;
    for (const { key, config } of configs) {
      const board = new Board();
      board.loadFrom(boardState);
      self.postMessage({ type: 'teachStart', payload: { key } });
      const search = new TeachingSearch(board, config, {
        timeLimitMs,
        onProgress: (info) => self.postMessage({ type: 'teachProgress', payload: { key, ...info } }),
      });
      self.postMessage({ type: 'teachResult', payload: { key, ...search.run(depth) } });
    }
    self.postMessage({ type: 'teachDone' });
  }

  if (type === 'legalMoves') {
    const board = new Board();
    board.loadFrom(payload.boardState);
    const gen = new MoveGenerator(board);
    const legal = gen.generateLegalMoves();
    const targets = legal.filter(m => m.startSq === payload.sq).map(m => m.targetSq);
    self.postMessage({ type: 'legalMoves', payload: { sq: payload.sq, targets } });
  }
};
