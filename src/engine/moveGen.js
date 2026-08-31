import { Move } from './move.js';

export class MoveGenerator {
  constructor(board) {
    this.board = board;
  }

  generateLegalMoves() {
    const pseudo = this.generatePseudoLegalMoves();
    const legal = [];
    for (const move of pseudo) {
      this.board.makeMove(move);
      const color = this.board.sideToMove === 'b' ? 'w' : 'b';
      if (!this.isInCheck(color)) legal.push(move);
      this.board.unmakeMove(move);
    }
    return legal;
  }

  generatePseudoLegalMoves() {
    const moves = [];
    const color = this.board.sideToMove;
    for (let sq = 0; sq < 64; sq++) {
      const piece = this.board.squares[sq];
      if (piece === '.') continue;
      if (color === 'w' && !piece.match(/[A-Z]/)) continue;
      if (color === 'b' && !piece.match(/[a-z]/)) continue;
      const pt = piece.toLowerCase();
      if (pt === 'p') this._pawnMoves(sq, color, moves);
      else if (pt === 'n') this._knightMoves(sq, color, moves);
      else if (pt === 'b') this._slidingMoves(sq, color, [-9, -7, 7, 9], moves);
      else if (pt === 'r') this._slidingMoves(sq, color, [-8, -1, 1, 8], moves);
      else if (pt === 'q') this._slidingMoves(sq, color, [-9, -8, -7, -1, 1, 7, 8, 9], moves);
      else if (pt === 'k') this._kingMoves(sq, color, moves);
    }
    return moves;
  }

  _pawnMoves(sq, color, moves) {
    const dir = color === 'w' ? -8 : 8;
    const startRank = color === 'w' ? 6 : 1;
    const promoRank = color === 'w' ? 0 : 7;

    const target = sq + dir;
    if (target >= 0 && target < 64 && this.board.squares[target] === '.') {
      const r = Math.floor(target / 8);
      if (r === promoRank) {
        for (const p of (color === 'w' ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n']))
          moves.push(new Move(sq, target, this.board.squares[sq], '.', false, false, p));
      } else {
        moves.push(new Move(sq, target, this.board.squares[sq]));
        if (Math.floor(sq / 8) === startRank) {
          const target2 = sq + 2 * dir;
          if (this.board.squares[target2] === '.')
            moves.push(new Move(sq, target2, this.board.squares[sq]));
        }
      }
    }

    for (const off of [-1, 1]) {
      if ((sq % 8 === 0 && off === -1) || (sq % 8 === 7 && off === 1)) continue;
      const t = sq + dir + off;
      if (t < 0 || t >= 64) continue;
      const tp = this.board.squares[t];
      if (tp !== '.' && this._isEnemy(tp, color)) {
        const r = Math.floor(t / 8);
        if (r === promoRank) {
          for (const p of (color === 'w' ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n']))
            moves.push(new Move(sq, t, this.board.squares[sq], tp, false, false, p));
        } else {
          moves.push(new Move(sq, t, this.board.squares[sq], tp));
        }
      } else if (t === this.board.enPassant) {
        moves.push(new Move(sq, t, this.board.squares[sq], color === 'w' ? 'p' : 'P', false, true));
      }
    }
  }

  _knightMoves(sq, color, moves) {
    for (const off of [-17, -15, -10, -6, 6, 10, 15, 17]) {
      const t = sq + off;
      if (t < 0 || t >= 64) continue;
      if (Math.abs((sq % 8) - (t % 8)) > 2) continue;
      const tp = this.board.squares[t];
      if (tp === '.' || this._isEnemy(tp, color))
        moves.push(new Move(sq, t, this.board.squares[sq], tp));
    }
  }

  _slidingMoves(sq, color, directions, moves) {
    for (const dir of directions) {
      for (let step = 1; step < 8; step++) {
        const t = sq + dir * step;
        if (t < 0 || t >= 64) break;
        const prevFile = (t - dir) % 8;
        const currFile = t % 8;
        if (Math.abs(currFile - prevFile) > 1) break;
        const tp = this.board.squares[t];
        if (tp === '.') {
          moves.push(new Move(sq, t, this.board.squares[sq]));
        } else {
          if (this._isEnemy(tp, color)) moves.push(new Move(sq, t, this.board.squares[sq], tp));
          break;
        }
      }
    }
  }

  _kingMoves(sq, color, moves) {
    for (const off of [-9, -8, -7, -1, 1, 7, 8, 9]) {
      const t = sq + off;
      if (t < 0 || t >= 64) continue;
      if (Math.abs((sq % 8) - (t % 8)) > 1) continue;
      const tp = this.board.squares[t];
      if (tp === '.' || this._isEnemy(tp, color))
        moves.push(new Move(sq, t, this.board.squares[sq], tp));
    }

    const enemy = color === 'w' ? 'b' : 'w';
    if (color === 'w') {
      if (this.board.castlingRights.K &&
        this.board.squares[61] === '.' && this.board.squares[62] === '.' &&
        !this.isSquareAttacked(60, enemy) && !this.isSquareAttacked(61, enemy) && !this.isSquareAttacked(62, enemy))
        moves.push(new Move(60, 62, 'K', '.', true));
      if (this.board.castlingRights.Q &&
        this.board.squares[59] === '.' && this.board.squares[58] === '.' && this.board.squares[57] === '.' &&
        !this.isSquareAttacked(60, enemy) && !this.isSquareAttacked(59, enemy) && !this.isSquareAttacked(58, enemy))
        moves.push(new Move(60, 58, 'K', '.', true));
    } else {
      if (this.board.castlingRights.k &&
        this.board.squares[5] === '.' && this.board.squares[6] === '.' &&
        !this.isSquareAttacked(4, enemy) && !this.isSquareAttacked(5, enemy) && !this.isSquareAttacked(6, enemy))
        moves.push(new Move(4, 6, 'k', '.', true));
      if (this.board.castlingRights.q &&
        this.board.squares[3] === '.' && this.board.squares[2] === '.' && this.board.squares[1] === '.' &&
        !this.isSquareAttacked(4, enemy) && !this.isSquareAttacked(3, enemy) && !this.isSquareAttacked(2, enemy))
        moves.push(new Move(4, 2, 'k', '.', true));
    }
  }

  _isEnemy(piece, color) {
    if (piece === '.') return false;
    return color === 'w' ? piece === piece.toLowerCase() : piece === piece.toUpperCase();
  }

  isInCheck(color) {
    const king = color === 'w' ? 'K' : 'k';
    const kingSq = this.board.squares.indexOf(king);
    if (kingSq === -1) return false;
    return this.isSquareAttacked(kingSq, color === 'w' ? 'b' : 'w');
  }

  isSquareAttacked(sq, attackingColor) {
    // Pawn attacks
    const pawnDir = attackingColor === 'b' ? -8 : 8;
    for (const off of [-1, 1]) {
      if ((sq % 8 === 0 && off === -1) || (sq % 8 === 7 && off === 1)) continue;
      const t = sq - pawnDir + off;
      if (t >= 0 && t < 64) {
        const p = this.board.squares[t];
        if (p === (attackingColor === 'b' ? 'p' : 'P')) return true;
      }
    }
    // Knight
    for (const off of [-17, -15, -10, -6, 6, 10, 15, 17]) {
      const t = sq + off;
      if (t >= 0 && t < 64 && Math.abs((sq % 8) - (t % 8)) <= 2) {
        const p = this.board.squares[t];
        if (p === (attackingColor === 'b' ? 'n' : 'N')) return true;
      }
    }
    // King
    for (const off of [-9, -8, -7, -1, 1, 7, 8, 9]) {
      const t = sq + off;
      if (t >= 0 && t < 64 && Math.abs((sq % 8) - (t % 8)) <= 1) {
        const p = this.board.squares[t];
        if (p === (attackingColor === 'b' ? 'k' : 'K')) return true;
      }
    }
    // Sliding
    const sliding = {
      b: [-9, -7, 7, 9], r: [-8, -1, 1, 8], q: [-9, -8, -7, -1, 1, 7, 8, 9]
    };
    for (const [pt, dirs] of Object.entries(sliding)) {
      const ep = attackingColor === 'b' ? pt : pt.toUpperCase();
      const eq = attackingColor === 'b' ? 'q' : 'Q';
      for (const dir of dirs) {
        for (let step = 1; step < 8; step++) {
          const t = sq + dir * step;
          if (t < 0 || t >= 64) break;
          if (Math.abs(((t - dir) % 8) - (t % 8)) > 1) break;
          const p = this.board.squares[t];
          if (p !== '.') {
            if (p === ep || p === eq) return true;
            break;
          }
        }
      }
    }
    return false;
  }
}
