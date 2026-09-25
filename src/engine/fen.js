// ── FEN validation ────────────────────────────────────────────────────────
// Board.parseFen trusts its input. Anything a person types goes through
// validateFen first, which says in plain words what is wrong with it.
import { Board } from './board.js';
import { MoveGenerator } from './moveGen.js';

const CASTLING_NEEDS = {
  K: { king: 60, kingPiece: 'K', rook: 63, rookPiece: 'R', name: 'White king-side' },
  Q: { king: 60, kingPiece: 'K', rook: 56, rookPiece: 'R', name: 'White queen-side' },
  k: { king: 4, kingPiece: 'k', rook: 7, rookPiece: 'r', name: 'Black king-side' },
  q: { king: 4, kingPiece: 'k', rook: 0, rookPiece: 'r', name: 'Black queen-side' },
};

// Returns null for a usable position, otherwise a message naming the problem.
// The move counters may be left off, as they often are in EPD test suites.
export function validateFen(input) {
  const fields = String(input).trim().split(/\s+/);
  if (fields.length < 2 || fields.length > 6 || !fields[0]) {
    return 'A FEN needs at least the placement and the side to move, e.g. "… w KQkq - 0 1".';
  }
  const [placement, side, castling = '-', ep = '-', half = '0', full = '1'] = fields;

  const ranks = placement.split('/');
  if (ranks.length !== 8) return `The placement has ${ranks.length} ranks; it needs 8, separated by "/".`;
  const squares = [];
  for (let r = 0; r < 8; r++) {
    for (const ch of ranks[r]) {
      if (/[1-8]/.test(ch)) squares.push(...'.'.repeat(Number(ch)));
      else if (/[pnbrqkPNBRQK]/.test(ch)) squares.push(ch);
      else return `"${ch}" is not a piece letter or a digit (rank ${8 - r}).`;
    }
    if (squares.length !== (r + 1) * 8) return `Rank ${8 - r} ("${ranks[r]}") does not add up to 8 squares.`;
  }

  if (side !== 'w' && side !== 'b') return `The side to move must be "w" or "b", not "${side}".`;

  for (const [king, name] of [['K', 'White'], ['k', 'Black']]) {
    const n = squares.filter(p => p === king).length;
    if (n !== 1) return `${name} must have exactly one king (found ${n}).`;
  }
  for (const [pawn, name] of [['P', 'White'], ['p', 'Black']]) {
    if (squares.slice(0, 8).includes(pawn) || squares.slice(56).includes(pawn)) {
      return `A ${name.toLowerCase()} pawn stands on the first or eighth rank.`;
    }
    if (squares.filter(p => p === pawn).length > 8) return `${name} has more than 8 pawns.`;
  }
  for (const [upper, name] of [[true, 'White'], [false, 'Black']]) {
    if (squares.filter(p => p !== '.' && (p < 'a') === upper).length > 16) return `${name} has more than 16 pieces.`;
  }

  if (castling !== '-') {
    if (!/^(?!.*(.).*\1)[KQkq]+$/.test(castling)) return `Castling rights must be "-" or letters from "KQkq", not "${castling}".`;
    for (const c of castling) {
      const need = CASTLING_NEEDS[c];
      if (squares[need.king] !== need.kingPiece || squares[need.rook] !== need.rookPiece) {
        return `${need.name} castling ("${c}") needs the king and rook on their starting squares.`;
      }
    }
  }

  if (ep !== '-') {
    const rank = side === 'w' ? '6' : '3';
    if (!/^[a-h][36]$/.test(ep) || ep[1] !== rank) {
      return `With ${side === 'w' ? 'White' : 'Black'} to move, an en passant square must be on rank ${rank}, not "${ep}".`;
    }
  }

  if (!/^\d+$/.test(half)) return `The half-move clock must be a whole number, not "${half}".`;
  if (!/^\d+$/.test(full) || Number(full) < 1) return `The move number must be 1 or more, not "${full}".`;

  // The side that just moved cannot have left its own king in check.
  const board = new Board();
  board.parseFen(`${placement} ${side} ${castling} ${ep} ${half} ${full}`);
  const waiting = side === 'w' ? 'b' : 'w';
  if (new MoveGenerator(board).isInCheck(waiting)) {
    return `${waiting === 'w' ? 'White' : 'Black'} is in check but it is not their move.`;
  }
  return null;
}

// A FEN with any missing counters filled in, ready for Board.parseFen.
export function normalizeFen(input) {
  const [placement, side, castling = '-', ep = '-', half = '0', full = '1'] = String(input).trim().split(/\s+/);
  return `${placement} ${side} ${castling} ${ep} ${half} ${full}`;
}
