// ── Standard Algebraic Notation ───────────────────────────────────────────
// SAN depends on the position: whether a move captures, which other pieces of
// the same kind could reach the square, and whether it gives check or mate. So
// both directions take the board as it stands before the move.
import { MoveGenerator } from './moveGen.js';

const FILES = 'abcdefgh';
export const squareName = (sq) => `${FILES[sq % 8]}${8 - Math.floor(sq / 8)}`;

// SAN for `move`, which must be legal on `board`. Pass the position's legal
// moves if they are already to hand, to save generating them again.
export function toSan(board, move, legal = new MoveGenerator(board).generateLegalMoves()) {
  let san;
  if (move.isCastling) {
    san = move.targetSq > move.startSq ? 'O-O' : 'O-O-O';
  } else {
    const piece = move.pieceMoved.toUpperCase();
    const capture = move.pieceCaptured !== '.';
    const to = squareName(move.targetSq);
    if (piece === 'P') {
      san = `${capture ? `${FILES[move.startSq % 8]}x` : ''}${to}`;
      if (move.promotionPiece !== '.') san += `=${move.promotionPiece.toUpperCase()}`;
    } else {
      san = `${piece}${disambiguate(move, legal)}${capture ? 'x' : ''}${to}`;
    }
  }

  board.makeMove(move);
  const gen = new MoveGenerator(board);
  if (gen.isInCheck(board.sideToMove)) san += gen.generateLegalMoves().length ? '+' : '#';
  board.unmakeMove(move);
  return san;
}

// When two pieces of the same kind can reach the square, the file of the one
// that moves tells them apart; failing that the rank; failing that, both.
function disambiguate(move, legal) {
  const rivals = legal.filter(m =>
    m.pieceMoved === move.pieceMoved && m.targetSq === move.targetSq && m.startSq !== move.startSq);
  if (!rivals.length) return '';
  const file = move.startSq % 8, rank = Math.floor(move.startSq / 8);
  if (rivals.every(m => m.startSq % 8 !== file)) return FILES[file];
  if (rivals.every(m => Math.floor(m.startSq / 8) !== rank)) return String(8 - rank);
  return squareName(move.startSq);
}

// SAN for a whole line of UCI moves played from `board`, which is left unchanged.
export function lineToSan(board, ucis) {
  const out = [];
  const made = [];
  for (const uci of ucis) {
    const legal = new MoveGenerator(board).generateLegalMoves();
    const move = legal.find(m => m.toUci() === uci);
    if (!move) break;
    out.push(toSan(board, move, legal));
    board.makeMove(move);
    made.push(move);
  }
  for (const move of made.reverse()) board.unmakeMove(move);
  return out;
}

const SAN_RE = /^([NBRQK])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([NBRQnbrq]))?$/;
const UCI_RE = /^([a-h][1-8])([a-h][1-8])([nbrq])?$/;

// Reads a typed move. Accepts SAN as it is usually written, with or without
// check marks, annotations, "x" or "=", castling with O or zero, and a
// needlessly disambiguated piece; also accepts UCI ("e2e4", "e7e8q").
// Returns { move } or { error }.
export function parseMove(board, text) {
  const legal = new MoveGenerator(board).generateLegalMoves();
  const input = String(text).trim().replace(/[+#!?]+$/, '').replace(/\s+/g, '');
  if (!input) return { error: 'Type a move, like e4, Nf3 or O-O.' };

  const castle = /^[O0o]-?[O0o](-?[O0o])?$/.exec(input);
  if (castle) {
    const long = Boolean(castle[1]);
    const move = legal.find(m => m.isCastling && (m.targetSq < m.startSq) === long);
    return move ? { move } : { error: `${long ? 'O-O-O' : 'O-O'} is not legal here.` };
  }

  const uci = UCI_RE.exec(input);
  if (uci) {
    const matches = legal.filter(m => m.toUci().slice(0, 4) === uci[1] + uci[2]);
    if (matches.length) {
      const move = matches.find(m => m.promotionPiece === '.' || m.promotionPiece.toLowerCase() === (uci[3] || 'q'));
      if (move) return { move };
    }
  }

  const san = SAN_RE.exec(input);
  if (!san) return { error: `"${text.trim()}" is not a move in SAN (e.g. e4, Nf3, exd5, O-O, e8=Q).` };
  const [, piece = 'P', fromFile, fromRank, , target, promo] = san;
  const color = board.sideToMove;
  const want = color === 'w' ? piece : piece.toLowerCase();
  const matches = legal.filter(m =>
    m.pieceMoved === want &&
    squareName(m.targetSq) === target &&
    (!fromFile || FILES[m.startSq % 8] === fromFile) &&
    (!fromRank || String(8 - Math.floor(m.startSq / 8)) === fromRank) &&
    (m.promotionPiece === '.' ? !promo : !promo || m.promotionPiece.toLowerCase() === promo.toLowerCase()));

  if (matches.length === 1) return { move: matches[0] };
  if (matches.length > 1) {
    if (matches.every(m => m.promotionPiece !== '.')) return { error: `Say what to promote to, e.g. ${target}=Q.` };
    return { error: `${text.trim()} is ambiguous: ${matches.map(m => toSan(board, m, legal)).join(' or ')}.` };
  }
  return { error: `${text.trim()} is not legal in this position.` };
}
