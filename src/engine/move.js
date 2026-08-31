// ── Move representation ───────────────────────────────────────────────────
export class Move {
  constructor(startSq, targetSq, pieceMoved, pieceCaptured = '.', isCastling = false, isEnPassant = false, promotionPiece = '.') {
    this.startSq = startSq;
    this.targetSq = targetSq;
    this.pieceMoved = pieceMoved;
    this.pieceCaptured = pieceCaptured;
    this.isCastling = isCastling;
    this.isEnPassant = isEnPassant;
    this.promotionPiece = promotionPiece;
  }

  toUci() {
    const sf = String.fromCharCode(97 + (this.startSq % 8));
    const sr = String(8 - Math.floor(this.startSq / 8));
    const tf = String.fromCharCode(97 + (this.targetSq % 8));
    const tr = String(8 - Math.floor(this.targetSq / 8));
    let uci = `${sf}${sr}${tf}${tr}`;
    if (this.promotionPiece !== '.') uci += this.promotionPiece.toLowerCase();
    return uci;
  }

  equals(other) {
    if (!other) return false;
    return this.startSq === other.startSq &&
      this.targetSq === other.targetSq &&
      this.promotionPiece === other.promotionPiece;
  }
}

export function uciToSq(alg) {
  const file = alg.charCodeAt(0) - 97;
  const rank = 8 - parseInt(alg[1]);
  return rank * 8 + file;
}
