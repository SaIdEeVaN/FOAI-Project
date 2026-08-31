from move import Move

class MoveGenerator:
    def __init__(self, board):
        self.board = board

    def generate_legal_moves(self):
        pseudo_legal_moves = self.generate_pseudo_legal_moves()
        legal_moves = []
        for move in pseudo_legal_moves:
            self.board.make_move(move)
            # Check if the move leaves the king of the side that just moved in check
            # Since side_to_move changed, we check the opposite side's king
            color = 'w' if self.board.side_to_move == 'b' else 'b'
            if not self.is_in_check(color):
                legal_moves.append(move)
            self.board.unmake_move(move)
        return legal_moves

    def generate_pseudo_legal_moves(self):
        moves = []
        color = self.board.side_to_move
        for sq in range(64):
            piece = self.board.squares[sq]
            if piece == '.':
                continue
            if (color == 'w' and piece.isupper()) or (color == 'b' and piece.islower()):
                piece_type = piece.lower()
                if piece_type == 'p':
                    self._generate_pawn_moves(sq, color, moves)
                elif piece_type == 'n':
                    self._generate_knight_moves(sq, color, moves)
                elif piece_type == 'b':
                    self._generate_sliding_moves(sq, color, [-9, -7, 7, 9], moves)
                elif piece_type == 'r':
                    self._generate_sliding_moves(sq, color, [-8, -1, 1, 8], moves)
                elif piece_type == 'q':
                    self._generate_sliding_moves(sq, color, [-9, -8, -7, -1, 1, 7, 8, 9], moves)
                elif piece_type == 'k':
                    self._generate_king_moves(sq, color, moves)
        return moves

    def _generate_pawn_moves(self, sq, color, moves):
        direction = -8 if color == 'w' else 8
        start_rank = 6 if color == 'w' else 1
        promotion_rank = 0 if color == 'w' else 7
        
        # Single push
        target = sq + direction
        if 0 <= target < 64 and self.board.squares[target] == '.':
            rank = target // 8
            if rank == promotion_rank:
                for p in ['q', 'r', 'b', 'n']:
                    moves.append(Move(sq, target, self.board.squares[sq], '.', promotion_piece=p.upper() if color == 'w' else p))
            else:
                moves.append(Move(sq, target, self.board.squares[sq], '.'))
                # Double push
                if sq // 8 == start_rank:
                    target2 = sq + 2 * direction
                    if self.board.squares[target2] == '.':
                        moves.append(Move(sq, target2, self.board.squares[sq], '.'))
                        
        # Captures
        for offset in [-1, 1]:
            # Edge wrap prevention
            if (sq % 8 == 0 and offset == -1) or (sq % 8 == 7 and offset == 1):
                continue
            target = sq + direction + offset
            if 0 <= target < 64:
                target_piece = self.board.squares[target]
                if target_piece != '.' and self._is_enemy(target_piece, color):
                    rank = target // 8
                    if rank == promotion_rank:
                        for p in ['q', 'r', 'b', 'n']:
                            moves.append(Move(sq, target, self.board.squares[sq], target_piece, promotion_piece=p.upper() if color == 'w' else p))
                    else:
                        moves.append(Move(sq, target, self.board.squares[sq], target_piece))
                elif target == self.board.en_passant:
                    moves.append(Move(sq, target, self.board.squares[sq], 'p' if color == 'w' else 'P', is_en_passant=True))

    def _generate_knight_moves(self, sq, color, moves):
        offsets = [-17, -15, -10, -6, 6, 10, 15, 17]
        for offset in offsets:
            target = sq + offset
            if 0 <= target < 64:
                # Wrap prevention
                if abs((sq % 8) - (target % 8)) > 2:
                    continue
                target_piece = self.board.squares[target]
                if target_piece == '.' or self._is_enemy(target_piece, color):
                    moves.append(Move(sq, target, self.board.squares[sq], target_piece))

    def _generate_sliding_moves(self, sq, color, directions, moves):
        for direction in directions:
            for step in range(1, 8):
                target = sq + direction * step
                if not (0 <= target < 64):
                    break
                # Wrap prevention
                prev_file = (target - direction) % 8
                curr_file = target % 8
                if abs(curr_file - prev_file) > 1:
                    break
                    
                target_piece = self.board.squares[target]
                if target_piece == '.':
                    moves.append(Move(sq, target, self.board.squares[sq], '.'))
                else:
                    if self._is_enemy(target_piece, color):
                        moves.append(Move(sq, target, self.board.squares[sq], target_piece))
                    break # Blocked by own piece or just captured an enemy piece

    def _generate_king_moves(self, sq, color, moves):
        offsets = [-9, -8, -7, -1, 1, 7, 8, 9]
        for offset in offsets:
            target = sq + offset
            if 0 <= target < 64:
                # Wrap prevention
                if abs((sq % 8) - (target % 8)) > 1:
                    continue
                target_piece = self.board.squares[target]
                if target_piece == '.' or self._is_enemy(target_piece, color):
                    moves.append(Move(sq, target, self.board.squares[sq], target_piece))
                    
        # Castling
        if color == 'w':
            if self.board.castling_rights['K']:
                if self.board.squares[61] == '.' and self.board.squares[62] == '.':
                    if not self.is_square_attacked(60, 'b') and not self.is_square_attacked(61, 'b') and not self.is_square_attacked(62, 'b'):
                        moves.append(Move(60, 62, 'K', is_castling=True))
            if self.board.castling_rights['Q']:
                if self.board.squares[59] == '.' and self.board.squares[58] == '.' and self.board.squares[57] == '.':
                    if not self.is_square_attacked(60, 'b') and not self.is_square_attacked(59, 'b') and not self.is_square_attacked(58, 'b'):
                        moves.append(Move(60, 58, 'K', is_castling=True))
        else:
            if self.board.castling_rights['k']:
                if self.board.squares[5] == '.' and self.board.squares[6] == '.':
                    if not self.is_square_attacked(4, 'w') and not self.is_square_attacked(5, 'w') and not self.is_square_attacked(6, 'w'):
                        moves.append(Move(4, 6, 'k', is_castling=True))
            if self.board.castling_rights['q']:
                if self.board.squares[3] == '.' and self.board.squares[2] == '.' and self.board.squares[1] == '.':
                    if not self.is_square_attacked(4, 'w') and not self.is_square_attacked(3, 'w') and not self.is_square_attacked(2, 'w'):
                        moves.append(Move(4, 2, 'k', is_castling=True))

    def _is_enemy(self, piece, color):
        if piece == '.':
            return False
        if color == 'w':
            return piece.islower()
        else:
            return piece.isupper()
            
    def is_in_check(self, color):
        # Find the king
        king_piece = 'K' if color == 'w' else 'k'
        king_sq = -1
        for sq in range(64):
            if self.board.squares[sq] == king_piece:
                king_sq = sq
                break
        if king_sq == -1:
            return False # Should not happen in a valid game
            
        enemy_color = 'b' if color == 'w' else 'w'
        return self.is_square_attacked(king_sq, enemy_color)

    def is_square_attacked(self, sq, attacking_color):
        # We can check attacks by looking outwards from the square in all directions
        # like a piece of the opposite type moving
        
        # 1. Pawn attacks
        pawn_dir = 8 if attacking_color == 'b' else -8
        for offset in [-1, 1]:
            # Wrap prevention
            if (sq % 8 == 0 and offset == -1) or (sq % 8 == 7 and offset == 1):
                continue
            target = sq - pawn_dir + offset # Reverse direction
            if 0 <= target < 64:
                piece = self.board.squares[target]
                if piece == ('p' if attacking_color == 'b' else 'P'):
                    return True
                    
        # 2. Knight attacks
        offsets = [-17, -15, -10, -6, 6, 10, 15, 17]
        for offset in offsets:
            target = sq + offset
            if 0 <= target < 64:
                if abs((sq % 8) - (target % 8)) <= 2:
                    piece = self.board.squares[target]
                    if piece == ('n' if attacking_color == 'b' else 'N'):
                        return True
                        
        # 3. King attacks
        offsets = [-9, -8, -7, -1, 1, 7, 8, 9]
        for offset in offsets:
            target = sq + offset
            if 0 <= target < 64:
                if abs((sq % 8) - (target % 8)) <= 1:
                    piece = self.board.squares[target]
                    if piece == ('k' if attacking_color == 'b' else 'K'):
                        return True
                        
        # 4. Sliding piece attacks
        directions = {
            'b': [-9, -7, 7, 9],
            'r': [-8, -1, 1, 8],
            'q': [-9, -8, -7, -1, 1, 7, 8, 9]
        }
        
        for piece_type, dirs in directions.items():
            enemy_piece = piece_type if attacking_color == 'b' else piece_type.upper()
            queen_piece = 'q' if attacking_color == 'b' else 'Q'
            
            for direction in dirs:
                for step in range(1, 8):
                    target = sq + direction * step
                    if not (0 <= target < 64):
                        break
                    prev_file = (target - direction) % 8
                    curr_file = target % 8
                    if abs(curr_file - prev_file) > 1:
                        break
                        
                    piece = self.board.squares[target]
                    if piece != '.':
                        if piece == enemy_piece or piece == queen_piece:
                            return True
                        break # Blocked by some other piece

        return False
