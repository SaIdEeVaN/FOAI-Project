// Flat single-path Staunton silhouettes, 45×45 viewBox. Draw any piece at any size
// with <Piece piece="N" />.
//
// Two rules keep a piece the colour it claims to be, on every device:
//
//   1. The path is inlined, not referenced through <use href="#…">. CSS does not
//      reliably cascade into a <use> shadow tree on WebKit/iOS.
//   2. fill and stroke are presentation attributes on the path itself, not
//      stylesheet rules. A path with no fill applied falls back to SVG's initial
//      value — black — so a white piece that loses its stylesheet, or whose CSS
//      never reaches it, renders as a black piece. That was the bug on mobile.
//
// CSS can still override a piece deliberately by targeting `.pc path`; a rule on
// the path beats the path's own presentation attribute.

const PATHS = {
  p: 'M22.5 7.5A5.5 5.5 0 0 1 25.8 17.4L28 19L28 21.5L25.6 21.5C25.6 26 28.5 30 31 33L33.5 35.5L33.5 39.5L11.5 39.5L11.5 35.5L14 33C16.5 30 19.4 26 19.4 21.5L17 21.5L17 19L19.2 17.4A5.5 5.5 0 0 1 22.5 7.5Z',
  r: 'M11 9L16 9L16 12L20 12L20 9L25 9L25 12L29 12L29 9L34 9L34 15L31 17.5L31 30L33.5 33L33.5 35.5L35 35.5L35 39.5L10 39.5L10 35.5L11.5 35.5L11.5 33L14 30L14 17.5L11 15Z',
  n: 'M11 39.5L11 35.5L13 35.5C13.5 30.5 16.5 27.5 20.5 24.5C18.5 23.5 16 24 14 24.5C12 25 10.5 25.5 9.5 24.5C8 23.5 7.5 22 8.5 20.5L15 13C16 11.5 17.5 10 19 9.5L19.5 5.5L23 8.5C30 9 34 15 34 24L33 35.5L34 35.5L34 39.5Z M18.2 13.5A1.3 1.3 0 1 0 20.8 13.5A1.3 1.3 0 1 0 18.2 13.5Z',
  b: 'M22.5 5.5A2.5 2.5 0 0 1 24 10C28 12.5 30.5 17 30.5 21C30.5 24 28.5 26 27 27L27 28.5L29 28.5L29 31L26.5 31L26.5 33L30 34.5L34 35.5L34 39.5L11 39.5L11 35.5L15 34.5L18.5 33L18.5 31L16 31L16 28.5L18 28.5L18 27C16.5 26 14.5 24 14.5 21C14.5 17 17 12.5 21 10A2.5 2.5 0 0 1 22.5 5.5Z M24.5 14.5L26 16L22 20L20.5 18.5Z',
  q: 'M9 13L14.5 21.5L15.5 10L19.5 20L22.5 8.5L25.5 20L29.5 10L30.5 21.5L36 13L31.5 29.5L32.5 31.5L31 33L32.5 35.5L34.5 35.5L34.5 39.5L10.5 39.5L10.5 35.5L12.5 35.5L14 33L12.5 31.5L13.5 29.5Z M7 12A2 2 0 1 1 11 12A2 2 0 1 1 7 12Z M13.5 9A2 2 0 1 1 17.5 9A2 2 0 1 1 13.5 9Z M20.5 7.5A2 2 0 1 1 24.5 7.5A2 2 0 1 1 20.5 7.5Z M27.5 9A2 2 0 1 1 31.5 9A2 2 0 1 1 27.5 9Z M34 12A2 2 0 1 1 38 12A2 2 0 1 1 34 12Z',
  k: 'M21 4L24 4L24 7L27 7L27 10L24 10L24 13.5C30 12.5 36 14.5 36 20.5C36 25 32.5 27.5 31 30L32 31.5L31 33L32.5 35.5L34.5 35.5L34.5 39.5L10.5 39.5L10.5 35.5L12.5 35.5L14 33L13 31.5L14 30C12.5 27.5 9 25 9 20.5C9 14.5 15 12.5 21 13.5L21 10L18 10L18 7L21 7Z',
};

// The knight's eye and the bishop's slit are cut-outs; the queen's balls overlap her crown.
const FILL_RULE = { p: 'nonzero', r: 'nonzero', n: 'evenodd', b: 'evenodd', q: 'nonzero', k: 'nonzero' };

const TONE = {
  white: { fill: '#F8F7F3', stroke: '#22211E', width: 1.5 },
  black: { fill: '#1F1E1B', stroke: 'rgba(255, 255, 255, 0.3)', width: 1.1 },
};

const NAMES = { p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king' };

export const pieceName = (piece) =>
  `${piece === piece.toUpperCase() ? 'White' : 'Black'} ${NAMES[piece.toLowerCase()]}`;

export function Piece({ piece, className = '', label }) {
  const type = piece.toLowerCase();
  const tone = piece === piece.toUpperCase() ? 'white' : 'black';
  const { fill, stroke, width } = TONE[tone];

  return (
    <svg
      className={`pc pc-${tone} ${className}`}
      viewBox="0 0 45 45"
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      <path
        d={PATHS[type]}
        fillRule={FILL_RULE[type]}
        fill={fill}
        stroke={stroke}
        strokeWidth={width}
        strokeLinejoin="round"
      />
    </svg>
  );
}
