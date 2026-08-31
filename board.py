class Board:
    def __init__(self):
        # 64-square array for the board.
        # Ranks 1-8 are indices 56-63 down to 0-7.
        # Let's map index = rank * 8 + file, where a1 is 56, h8 is 7?
        # Standard convention: a1 = 56, b1 = 57, ..., h8 = 7 (so a8=0...h8=7).
        # Actually, let's use: index 0 is a8, 63 is h1.
        self.squares = ['.'] * 64
        self.side_to_move = 'w' # 'w' or 'b'
        self.castling_rights = {'K': False, 'Q': False, 'k': False, 'q': False}
        self.en_passant = None # index of en passant target square
        self.half_move_clock = 0
        self.full_move_number = 1
        self.history = [] # Stack to keep track of state for unmake_move
        
        # Parse initial FEN
        self.parse_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")

    def parse_fen(self, fen):
        parts = fen.split(' ')
        
        # 1. Piece placement
        rank = 0
        file = 0
        for char in parts[0]:
            if char == '/':
                rank += 1
                file = 0
            elif char.isdigit():
                for _ in range(int(char)):
                    self.squares[rank * 8 + file] = '.'
                    file += 1
            else:
                self.squares[rank * 8 + file] = char
                file += 1
                
        # 2. Side to move
        self.side_to_move = parts[1]
        
        # 3. Castling rights
        self.castling_rights = {'K': False, 'Q': False, 'k': False, 'q': False}
        if parts[2] != '-':
            for char in parts[2]:
                if char in self.castling_rights:
                    self.castling_rights[char] = True
                    
        # 4. En passant
        if parts[3] != '-':
            file_idx = ord(parts[3][0]) - ord('a')
            rank_idx = 8 - int(parts[3][1])
            self.en_passant = rank_idx * 8 + file_idx
        else:
            self.en_passant = None
            
        # 5. Halfmove clock
        self.half_move_clock = int(parts[4]) if len(parts) > 4 else 0
        
        # 6. Fullmove number
        self.full_move_number = int(parts[5]) if len(parts) > 5 else 1

    def print_board(self):
        print("\n  a b c d e f g h")
        print("  ---------------")
        for rank in range(8):
            row_str = str(8 - rank) + "|"
            for file in range(8):
                piece = self.squares[rank * 8 + file]
                row_str += piece + " "
            print(row_str + "|" + str(8 - rank))
        print("  ---------------")
        print("  a b c d e f g h\n")
        print(f"Side to move: {'White' if self.side_to_move == 'w' else 'Black'}")
        rights = "".join([k for k, v in self.castling_rights.items() if v])
        print(f"Castling rights: {rights if rights else '-'}")
        if self.en_passant is not None:
            ep_file = chr((self.en_passant % 8) + ord('a'))
            ep_rank = str(8 - (self.en_passant // 8))
            print(f"En passant: {ep_file}{ep_rank}")
        else:
            print("En passant: -")
            
    def get_piece(self, sq):
        return self.squares[sq]
        
    def set_piece(self, sq, piece):
        self.squares[sq] = piece

    def make_move(self, move):
        # Save state
        state = {
            'castling_rights': self.castling_rights.copy(),
            'en_passant': self.en_passant,
            'half_move_clock': self.half_move_clock
        }
        self.history.append(state)
        
        piece_moved = self.squares[move.start_sq]
        
        # Move piece
        self.squares[move.target_sq] = piece_moved
        self.squares[move.start_sq] = '.'
        
        # Handle en passant capture
        if move.is_en_passant:
            # The captured pawn is on the same rank as the start_sq and same file as target_sq
            ep_capture_sq = move.target_sq + (8 if self.side_to_move == 'w' else -8)
            self.squares[ep_capture_sq] = '.'
            
        # Handle promotion
        if move.promotion_piece != '.':
            self.squares[move.target_sq] = move.promotion_piece
            
        # Handle castling (move the rook)
        if move.is_castling:
            if move.target_sq - move.start_sq == 2: # Kingside
                self.squares[move.target_sq - 1] = self.squares[move.target_sq + 1]
                self.squares[move.target_sq + 1] = '.'
            elif move.start_sq - move.target_sq == 2: # Queenside
                self.squares[move.target_sq + 1] = self.squares[move.target_sq - 2]
                self.squares[move.target_sq - 2] = '.'
                
        # Update en_passant square
        self.en_passant = None
        if piece_moved.lower() == 'p' and abs(move.target_sq - move.start_sq) == 16:
            self.en_passant = move.start_sq + (8 if self.side_to_move == 'b' else -8)
            
        # Update castling rights
        # King moves
        if piece_moved == 'K':
            self.castling_rights['K'] = False
            self.castling_rights['Q'] = False
        elif piece_moved == 'k':
            self.castling_rights['k'] = False
            self.castling_rights['q'] = False
            
        # Rook moves or captures
        rooks = {63: 'K', 56: 'Q', 7: 'k', 0: 'q'}
        for sq in [move.start_sq, move.target_sq]:
            if sq in rooks:
                self.castling_rights[rooks[sq]] = False
                
        # Update half move clock
        if piece_moved.lower() == 'p' or move.piece_captured != '.':
            self.half_move_clock = 0
        else:
            self.half_move_clock += 1
            
        # Update turn and full move
        if self.side_to_move == 'b':
            self.full_move_number += 1
        self.side_to_move = 'b' if self.side_to_move == 'w' else 'w'
        
    def unmake_move(self, move):
        self.side_to_move = 'w' if self.side_to_move == 'b' else 'b'
        if self.side_to_move == 'b':
            self.full_move_number -= 1
            
        # Restore state
        state = self.history.pop()
        self.castling_rights = state['castling_rights']
        self.en_passant = state['en_passant']
        self.half_move_clock = state['half_move_clock']
        
        piece_moved = move.promotion_piece if move.promotion_piece != '.' else self.squares[move.target_sq]
        
        # Undo promotion
        if move.promotion_piece != '.':
            self.squares[move.target_sq] = 'P' if self.side_to_move == 'w' else 'p'
            
        # Move piece back
        self.squares[move.start_sq] = self.squares[move.target_sq]
        self.squares[move.target_sq] = move.piece_captured
        
        # Restore en passant capture
        if move.is_en_passant:
            ep_capture_sq = move.target_sq + (8 if self.side_to_move == 'w' else -8)
            self.squares[ep_capture_sq] = 'p' if self.side_to_move == 'w' else 'P'
            self.squares[move.target_sq] = '.'
            
        # Restore castling (move the rook back)
        if move.is_castling:
            if move.target_sq - move.start_sq == 2: # Kingside
                self.squares[move.target_sq + 1] = self.squares[move.target_sq - 1]
                self.squares[move.target_sq - 1] = '.'
            elif move.start_sq - move.target_sq == 2: # Queenside
                self.squares[move.target_sq - 2] = self.squares[move.target_sq + 1]
                self.squares[move.target_sq + 1] = '.'
