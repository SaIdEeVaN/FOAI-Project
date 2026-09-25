// ── Board representation ──────────────────────────────────────────────────
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// A move from or to a rook's home corner removes that castling right.
const ROOK_CORNERS = { 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };

export class Board {
  constructor() {
    this.squares = Array(64).fill('.');
    this.sideToMove = 'w';
    this.castlingRights = { K: false, Q: false, k: false, q: false };
    this.enPassant = null;
    this.halfMoveClock = 0;
    this.fullMoveNumber = 1;
    this.history = [];
    this.parseFen(START_FEN);
  }

  parseFen(fen) {
    const parts = fen.split(' ');
    this.squares = Array(64).fill('.');
    let rank = 0, file = 0;
    for (const ch of parts[0]) {
      if (ch === '/') { rank++; file = 0; }
      else if (ch >= '1' && ch <= '8') { file += parseInt(ch); }
      else { this.squares[rank * 8 + file] = ch; file++; }
    }
    this.sideToMove = parts[1] || 'w';
    this.castlingRights = { K: false, Q: false, k: false, q: false };
    if (parts[2] && parts[2] !== '-') {
      for (const ch of parts[2]) if (ch in this.castlingRights) this.castlingRights[ch] = true;
    }
    if (parts[3] && parts[3] !== '-') {
      const f = parts[3].charCodeAt(0) - 97;
      const r = 8 - parseInt(parts[3][1]);
      this.enPassant = r * 8 + f;
    } else {
      this.enPassant = null;
    }
    this.halfMoveClock = parts[4] ? parseInt(parts[4]) : 0;
    this.fullMoveNumber = parts[5] ? parseInt(parts[5]) : 1;
    this.history = [];
  }

  reset() { this.parseFen(START_FEN); }

  toFen() {
    const ranks = [];
    for (let r = 0; r < 8; r++) {
      let row = '', empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.squares[r * 8 + f];
        if (p === '.') { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += p;
      }
      ranks.push(empty ? row + empty : row);
    }
    const rights = ['K', 'Q', 'k', 'q'].filter(c => this.castlingRights[c]).join('') || '-';
    const ep = this.enPassant === null ? '-'
      : `${String.fromCharCode(97 + (this.enPassant % 8))}${8 - Math.floor(this.enPassant / 8)}`;
    return `${ranks.join('/')} ${this.sideToMove} ${rights} ${ep} ${this.halfMoveClock} ${this.fullMoveNumber}`;
  }

  serialize() {
    return {
      squares: [...this.squares],
      sideToMove: this.sideToMove,
      castlingRights: { ...this.castlingRights },
      enPassant: this.enPassant,
      halfMoveClock: this.halfMoveClock,
      fullMoveNumber: this.fullMoveNumber,
    };
  }

  loadFrom(state) {
    this.squares = [...state.squares];
    this.sideToMove = state.sideToMove;
    this.castlingRights = { ...state.castlingRights };
    this.enPassant = state.enPassant;
    this.halfMoveClock = state.halfMoveClock;
    this.fullMoveNumber = state.fullMoveNumber;
    this.history = [];
  }

  makeMove(move) {
    this.history.push({
      castlingRights: { ...this.castlingRights },
      enPassant: this.enPassant,
      halfMoveClock: this.halfMoveClock,
    });

    const pieceMoved = this.squares[move.startSq];
    this.squares[move.targetSq] = pieceMoved;
    this.squares[move.startSq] = '.';

    if (move.isEnPassant) {
      const capSq = move.targetSq + (this.sideToMove === 'w' ? 8 : -8);
      this.squares[capSq] = '.';
    }
    if (move.promotionPiece !== '.') {
      this.squares[move.targetSq] = move.promotionPiece;
    }
    if (move.isCastling) {
      const diff = move.targetSq - move.startSq;
      if (diff === 2) { // Kingside
        this.squares[move.targetSq - 1] = this.squares[move.targetSq + 1];
        this.squares[move.targetSq + 1] = '.';
      } else { // Queenside
        this.squares[move.targetSq + 1] = this.squares[move.targetSq - 2];
        this.squares[move.targetSq - 2] = '.';
      }
    }

    // En passant square
    this.enPassant = null;
    if (pieceMoved.toLowerCase() === 'p' && Math.abs(move.targetSq - move.startSq) === 16) {
      this.enPassant = move.startSq + (this.sideToMove === 'b' ? 8 : -8);
    }

    // Castling rights
    if (pieceMoved === 'K') { this.castlingRights.K = false; this.castlingRights.Q = false; }
    if (pieceMoved === 'k') { this.castlingRights.k = false; this.castlingRights.q = false; }
    const fromCorner = ROOK_CORNERS[move.startSq];
    if (fromCorner) this.castlingRights[fromCorner] = false;
    const toCorner = ROOK_CORNERS[move.targetSq];
    if (toCorner) this.castlingRights[toCorner] = false;

    // Half-move clock
    if (pieceMoved.toLowerCase() === 'p' || move.pieceCaptured !== '.') {
      this.halfMoveClock = 0;
    } else {
      this.halfMoveClock++;
    }

    if (this.sideToMove === 'b') this.fullMoveNumber++;
    this.sideToMove = this.sideToMove === 'w' ? 'b' : 'w';
  }

  // Identity of a position for repetition claims: placement, side to move,
  // castling rights and en passant. Deliberately not called from makeMove —
  // the search makes millions of moves and must not pay for this; the game
  // layer calls it once per committed move.
  positionKey() {
    const rights =
      (this.castlingRights.K ? 'K' : '') +
      (this.castlingRights.Q ? 'Q' : '') +
      (this.castlingRights.k ? 'k' : '') +
      (this.castlingRights.q ? 'q' : '') || '-';
    const ep = this._capturableEnPassant();
    return `${this.squares.join('')} ${this.sideToMove} ${rights} ${ep === null ? '-' : ep}`;
  }

  // An en passant square only tells two positions apart when the capture is
  // really on. Otherwise a position reached with a spent en passant square
  // would not match the same position reached without one, and a legitimate
  // repetition would go unnoticed.
  _capturableEnPassant() {
    const ep = this.enPassant;
    if (ep === null) return null;
    const pawn = this.sideToMove === 'w' ? 'P' : 'p';
    // A pawn that could take stands one rank behind the target, on either side.
    const behind = ep + (this.sideToMove === 'w' ? 8 : -8);
    for (const step of [-1, 1]) {
      const from = behind + step;
      if (from < 0 || from > 63) continue;
      if (Math.abs((from % 8) - (ep % 8)) !== 1) continue; // Guards the file wrap
      if (this.squares[from] === pawn) return ep;
    }
    return null;
  }

  unmakeMove(move) {
    this.sideToMove = this.sideToMove === 'w' ? 'b' : 'w';
    if (this.sideToMove === 'b') this.fullMoveNumber--;

    const state = this.history.pop();
    this.castlingRights = state.castlingRights;
    this.enPassant = state.enPassant;
    this.halfMoveClock = state.halfMoveClock;

    // Undo promotion
    if (move.promotionPiece !== '.') {
      this.squares[move.targetSq] = this.sideToMove === 'w' ? 'P' : 'p';
    }

    this.squares[move.startSq] = this.squares[move.targetSq];
    this.squares[move.targetSq] = move.pieceCaptured;

    if (move.isEnPassant) {
      const capSq = move.targetSq + (this.sideToMove === 'w' ? 8 : -8);
      this.squares[capSq] = this.sideToMove === 'w' ? 'p' : 'P';
      this.squares[move.targetSq] = '.';
    }

    if (move.isCastling) {
      const diff = move.targetSq - move.startSq;
      if (diff === 2) {
        this.squares[move.targetSq + 1] = this.squares[move.targetSq - 1];
        this.squares[move.targetSq - 1] = '.';
      } else {
        this.squares[move.targetSq - 2] = this.squares[move.targetSq + 1];
        this.squares[move.targetSq + 1] = '.';
      }
    }
  }
}

// Three occurrences of the same position is a draw. The current position is the
// last key in the list, and the occurrences need not be consecutive.
export function hasThreefoldRepetition(keys) {
  const current = keys[keys.length - 1];
  let seen = 0;
  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i] === current && ++seen === 3) return true;
  }
  return false;
}
