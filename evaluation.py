class Evaluation:
    def __init__(self):
        # Material values
        self.piece_values = {
            'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000,
            'p': -100, 'n': -320, 'b': -330, 'r': -500, 'q': -900, 'k': -20000
        }
        
        # Piece-Square Tables (PST) - White's perspective
        # These tables encourage pieces to control the center and develop properly
        self.pawn_pst = [
             0,  0,  0,  0,  0,  0,  0,  0,
            50, 50, 50, 50, 50, 50, 50, 50,
            10, 10, 20, 30, 30, 20, 10, 10,
             5,  5, 10, 25, 25, 10,  5,  5,
             0,  0,  0, 20, 20,  0,  0,  0,
             5, -5,-10,  0,  0,-10, -5,  5,
             5, 10, 10,-20,-20, 10, 10,  5,
             0,  0,  0,  0,  0,  0,  0,  0
        ]
        
        self.knight_pst = [
            -50,-40,-30,-30,-30,-30,-40,-50,
            -40,-20,  0,  0,  0,  0,-20,-40,
            -30,  0, 10, 15, 15, 10,  0,-30,
            -30,  5, 15, 20, 20, 15,  5,-30,
            -30,  0, 15, 20, 20, 15,  0,-30,
            -30,  5, 10, 15, 15, 10,  5,-30,
            -40,-20,  0,  5,  5,  0,-20,-40,
            -50,-40,-30,-30,-30,-30,-40,-50
        ]
        
        self.bishop_pst = [
            -20,-10,-10,-10,-10,-10,-10,-20,
            -10,  0,  0,  0,  0,  0,  0,-10,
            -10,  0,  5, 10, 10,  5,  0,-10,
            -10,  5,  5, 10, 10,  5,  5,-10,
            -10,  0, 10, 10, 10, 10,  0,-10,
            -10, 10, 10, 10, 10, 10, 10,-10,
            -10,  5,  0,  0,  0,  0,  5,-10,
            -20,-10,-10,-10,-10,-10,-10,-20
        ]
        
        self.rook_pst = [
             0,  0,  0,  0,  0,  0,  0,  0,
             5, 10, 10, 10, 10, 10, 10,  5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
             0,  0,  0,  5,  5,  0,  0,  0
        ]
        
        self.queen_pst = [
            -20,-10,-10, -5, -5,-10,-10,-20,
            -10,  0,  0,  0,  0,  0,  0,-10,
            -10,  0,  5,  5,  5,  5,  0,-10,
             -5,  0,  5,  5,  5,  5,  0, -5,
              0,  0,  5,  5,  5,  5,  0, -5,
            -10,  5,  5,  5,  5,  5,  0,-10,
            -10,  0,  5,  0,  0,  0,  0,-10,
            -20,-10,-10, -5, -5,-10,-10,-20
        ]
        
        self.king_mg_pst = [
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -20,-30,-30,-40,-40,-30,-30,-20,
            -10,-20,-20,-20,-20,-20,-20,-10,
             20, 20,  0,  0,  0,  0, 20, 20,
             20, 30, 10,  0,  0, 10, 30, 20
        ]

    def evaluate(self, board):
        score = 0
        white_pawns = []
        black_pawns = []
        
        white_king_sq = -1
        black_king_sq = -1
        
        for sq in range(64):
            piece = board.squares[sq]
            if piece == '.':
                continue
                
            # 1. Material Evaluation
            score += self.piece_values[piece]
            
            is_white = piece.isupper()
            # Flip board vertically for black PST lookups
            pst_sq = sq if is_white else (63 - sq)
            
            # 2. Piece-Square Table (Positional) Evaluation
            piece_type = piece.lower()
            pst_score = 0
            if piece_type == 'p':
                pst_score = self.pawn_pst[pst_sq]
                if is_white:
                    white_pawns.append(sq)
                else:
                    black_pawns.append(sq)
            elif piece_type == 'n':
                pst_score = self.knight_pst[pst_sq]
            elif piece_type == 'b':
                pst_score = self.bishop_pst[pst_sq]
            elif piece_type == 'r':
                pst_score = self.rook_pst[pst_sq]
            elif piece_type == 'q':
                pst_score = self.queen_pst[pst_sq]
            elif piece_type == 'k':
                pst_score = self.king_mg_pst[pst_sq]
                if is_white:
                    white_king_sq = sq
                else:
                    black_king_sq = sq
                
            if is_white:
                score += pst_score
            else:
                score -= pst_score
                
        # 3. Pawn Structure Evaluation (Doubled & Isolated Pawns)
        score += self._evaluate_pawn_structure(white_pawns, 'w')
        score -= self._evaluate_pawn_structure(black_pawns, 'b')
        
        # 4. King Safety
        score += self._evaluate_king_safety(white_king_sq, white_pawns, black_pawns, 'w')
        score -= self._evaluate_king_safety(black_king_sq, black_pawns, white_pawns, 'b')
        
        # 5. Piece Mobility
        score += self._evaluate_mobility(board)

        # Return score from the perspective of the side to move
        return score if board.side_to_move == 'w' else -score

    def _evaluate_pawn_structure(self, pawns, color):
        penalty = 0
        files = [sq % 8 for sq in pawns]
        
        # Doubled pawns
        for f in range(8):
            count = files.count(f)
            if count > 1:
                penalty += 15 * count # Penalty for each doubled pawn
                
        # Isolated pawns
        for sq in pawns:
            file = sq % 8
            # Check adjacent files
            has_neighbor = False
            if file > 0 and (file - 1) in files:
                has_neighbor = True
            if file < 7 and (file + 1) in files:
                has_neighbor = True
                
            if not has_neighbor:
                penalty += 20 # Penalty for isolated pawn
                
        return -penalty

    def _evaluate_king_safety(self, king_sq, own_pawns, enemy_pawns, color):
        if king_sq == -1:
            return 0
            
        safety_score = 0
        king_file = king_sq % 8
        
        # Penalize if king is on an open or semi-open file
        own_pawns_files = [sq % 8 for sq in own_pawns]
        enemy_pawns_files = [sq % 8 for sq in enemy_pawns]
        
        if king_file not in own_pawns_files:
            safety_score -= 30 # Semi-open file penalty
            if king_file not in enemy_pawns_files:
                safety_score -= 20 # Fully open file penalty
                
        # Pawn shield evaluation (only if king is castled or on edge)
        if king_file <= 2 or king_file >= 5:
            direction = -8 if color == 'w' else 8
            shield_sqs = [king_sq + direction - 1, king_sq + direction, king_sq + direction + 1]
            for sq in shield_sqs:
                if 0 <= sq < 64:
                    if (sq % 8) != 0 and (sq % 8) != 7: # prevent edge wrap issues broadly
                        if sq in own_pawns:
                            safety_score += 10 # Bonus for pawn shield
                            
        return safety_score

    def _evaluate_mobility(self, board):
        # A lightweight mobility evaluation
        # Calculate pseudo-legal moves for knights and bishops (simple approximation)
        mobility_score = 0
        for sq in range(64):
            piece = board.squares[sq]
            if piece.lower() == 'n':
                moves = self._knight_mobility(sq)
                if piece.isupper():
                    mobility_score += moves * 2
                else:
                    mobility_score -= moves * 2
            elif piece.lower() == 'b':
                moves = self._bishop_mobility(board, sq)
                if piece.isupper():
                    mobility_score += moves * 2
                else:
                    mobility_score -= moves * 2
        return mobility_score

    def _knight_mobility(self, sq):
        offsets = [-17, -15, -10, -6, 6, 10, 15, 17]
        count = 0
        for offset in offsets:
            target = sq + offset
            if 0 <= target < 64 and abs((sq % 8) - (target % 8)) <= 2:
                count += 1
        return count
        
    def _bishop_mobility(self, board, sq):
        directions = [-9, -7, 7, 9]
        count = 0
        for direction in directions:
            for step in range(1, 8):
                target = sq + direction * step
                if not (0 <= target < 64):
                    break
                prev_file = (target - direction) % 8
                curr_file = target % 8
                if abs(curr_file - prev_file) > 1:
                    break
                count += 1
                if board.squares[target] != '.':
                    break
        return count
