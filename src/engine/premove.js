// Squares a piece may be premoved to while the engine is still thinking. The
// opponent's reply is unknown, so this is geometry only: every square the piece
// could reach on some future board, whatever stands in between. Whether the
// premove is actually legal is settled when it is played.

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING   = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK   = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const isOwn = (piece, color) => piece !== '.' && (color === 'w' ? piece < 'a' : piece >= 'a');

export function premoveTargets(squares, castlingRights, sq) {
  const piece = squares[sq];
  if (piece === '.') return [];
  const color = piece < 'a' ? 'w' : 'b';
  const rank = Math.floor(sq / 8), file = sq % 8;
  const targets = [];
  const add = (r, f) => { if (r >= 0 && r < 8 && f >= 0 && f < 8) targets.push(r * 8 + f); };
  const steps = (dirs) => dirs.forEach(([dr, df]) => add(rank + dr, file + df));
  const rays = (dirs) => dirs.forEach(([dr, df]) => {
    for (let i = 1; i < 8; i++) add(rank + dr * i, file + df * i);
  });

  switch (piece.toLowerCase()) {
    case 'p': {
      const dir = color === 'w' ? -1 : 1; // Rank 0 is the eighth rank
      add(rank + dir, file);
      if (rank === (color === 'w' ? 6 : 1)) add(rank + 2 * dir, file);
      add(rank + dir, file - 1);
      add(rank + dir, file + 1);
      break;
    }
    case 'n': steps(KNIGHT); break;
    case 'b': rays(BISHOP); break;
    case 'r': rays(ROOK); break;
    case 'q': rays(ROOK); rays(BISHOP); break;
    case 'k': {
      steps(KING);
      const home = color === 'w' ? 60 : 4;
      if (sq === home) {
        if (castlingRights[color === 'w' ? 'K' : 'k']) targets.push(home + 2);
        if (castlingRights[color === 'w' ? 'Q' : 'q']) targets.push(home - 2);
      }
      break;
    }
  }
  // A square your own piece still stands on can only be a target if that piece
  // moves first, which a single premove cannot arrange.
  return targets.filter(t => !isOwn(squares[t], color));
}
