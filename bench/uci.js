// Minimal UCI client for driving an external engine (Stockfish) from Node.
//
// The engine is found at, in order: --stockfish <path>, $STOCKFISH, or the
// single-threaded WASM build from the `stockfish` npm package, which is not a
// project dependency (it is ~100 MB) — install it for a run with
//   npm install --no-save stockfish
// A path ending in .js is run with Node; anything else is run as a binary.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const DEFAULT_JS = fileURLToPath(new URL('../node_modules/stockfish/bin/stockfish-19-single.js', import.meta.url));

export function stockfishPath(argv = process.argv) {
  const i = argv.indexOf('--stockfish');
  const path = i >= 0 ? argv[i + 1] : process.env.STOCKFISH || DEFAULT_JS;
  if (!existsSync(path)) {
    throw new Error(`No engine at ${path}. Run "npm install --no-save stockfish" or pass --stockfish <path>.`);
  }
  return path;
}

export class UciEngine {
  constructor(path) {
    this.path = path;
    this.proc = path.endsWith('.js')
      ? spawn(process.execPath, [path], { stdio: ['pipe', 'pipe', 'inherit'] })
      : spawn(path, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.waiters = [];
    this.lines = createInterface({ input: this.proc.stdout });
    this.lines.on('line', (line) => {
      for (const w of [...this.waiters]) {
        if (w.onLine(line)) this.waiters.splice(this.waiters.indexOf(w), 1);
      }
    });
  }

  send(cmd) { this.proc.stdin.write(cmd + '\n'); }

  // Resolves with every line up to and including the first that satisfies `done`.
  _until(done) {
    return new Promise((resolve) => {
      const seen = [];
      this.waiters.push({ onLine: (line) => { seen.push(line); if (done(line)) { resolve(seen); return true; } return false; } });
    });
  }

  async init(options = {}) {
    const ok = this._until(l => l === 'uciok');
    this.send('uci');
    await ok;
    for (const [name, value] of Object.entries(options)) this.send(`setoption name ${name} value ${value}`);
    await this.ready();
  }

  async ready() {
    const ok = this._until(l => l === 'readyok');
    this.send('isready');
    await ok;
  }

  async newGame() {
    this.send('ucinewgame');
    await this.ready();
  }

  // position: { fen, moves } — returns { bestmove, infos } where infos are the
  // parsed "info" lines (depth, multipv, score in cp or mate, pv).
  async go({ fen, moves = [] }, goArgs) {
    this.send(`position ${fen ? `fen ${fen}` : 'startpos'}${moves.length ? ` moves ${moves.join(' ')}` : ''}`);
    const done = this._until(l => l.startsWith('bestmove'));
    this.send(`go ${goArgs}`);
    const lines = await done;
    const bestmove = lines.at(-1).split(/\s+/)[1];
    return { bestmove, infos: lines.filter(l => l.startsWith('info') && l.includes(' pv ')).map(parseInfo) };
  }

  quit() {
    this.send('quit');
    setTimeout(() => this.proc.kill(), 500).unref();
  }
}

function parseInfo(line) {
  const t = line.split(/\s+/);
  const get = (k) => { const i = t.indexOf(k); return i >= 0 ? t[i + 1] : undefined; };
  const info = { depth: Number(get('depth')), multipv: Number(get('multipv') || 1) };
  const s = t.indexOf('score');
  if (s >= 0) info[t[s + 1]] = Number(t[s + 2]); // info.cp or info.mate
  info.pv = t.slice(t.indexOf('pv') + 1);
  return info;
}
