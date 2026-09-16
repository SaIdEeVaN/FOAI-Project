// Web Worker — runs engine search off the main thread
import { Board } from './board.js';
import { SearchEngine } from './search.js';
import { TeachingSearch } from './teachingSearch.js';
import { MoveGenerator } from './moveGen.js';
import { Move } from './move.js';

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === 'search') {
    const board = new Board();
    board.loadFrom(payload.boardState);

    const engine = new SearchEngine(board);
    const { bestMove, depth, nodes, score } = engine.getBestMove(
      payload.timeLimitMs || 2000,
      (info) => self.postMessage({ type: 'progress', payload: info })
    );

    self.postMessage({
      type: 'result',
      payload: {
        uci: bestMove ? bestMove.toUci() : null,
        depth,
        nodes,
        score,
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
