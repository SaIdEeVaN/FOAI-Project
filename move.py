class Move:
    def __init__(self, start_sq, target_sq, piece_moved, piece_captured='.', 
                 is_castling=False, is_en_passant=False, promotion_piece='.'):
        self.start_sq = start_sq
        self.target_sq = target_sq
        self.piece_moved = piece_moved
        self.piece_captured = piece_captured
        self.is_castling = is_castling
        self.is_en_passant = is_en_passant
        self.promotion_piece = promotion_piece

    def to_uci(self):
        # Convert start/target squares (0-63) to UCI string (e.g., 'e2e4')
        start_file = chr((self.start_sq % 8) + ord('a'))
        start_rank = str(8 - (self.start_sq // 8))
        target_file = chr((self.target_sq % 8) + ord('a'))
        target_rank = str(8 - (self.target_sq // 8))
        
        uci = f"{start_file}{start_rank}{target_file}{target_rank}"
        if self.promotion_piece != '.':
            uci += self.promotion_piece.lower()
        return uci
        
    def __repr__(self):
        return self.to_uci()
        
    def __eq__(self, other):
        if not isinstance(other, Move):
            return False
        return (self.start_sq == other.start_sq and
                self.target_sq == other.target_sq and
                self.promotion_piece == other.promotion_piece)
