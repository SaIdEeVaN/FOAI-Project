import random

class TranspositionTable:
    # TT Flags
    EXACT = 0
    ALPHA = 1 # Upper bound
    BETA = 2  # Lower bound

    def __init__(self):
        self.table = {}
        self.zobrist_keys = self.init_zobrist()
        
    def init_zobrist(self):
        random.seed(42) # Fixed seed for reproducible hashes
        keys = {}
        # 12 piece types
        pieces = ['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']
        for p in pieces:
            keys[p] = [random.getrandbits(64) for _ in range(64)]
            
        keys['black_to_move'] = random.getrandbits(64)
        
        # Castling rights: 16 combinations (4 bits)
        keys['castling'] = [random.getrandbits(64) for _ in range(16)]
        
        # En passant files: 8 files
        keys['en_passant'] = [random.getrandbits(64) for _ in range(8)]
        return keys

    def compute_hash(self, board):
        h = 0
        for sq in range(64):
            piece = board.squares[sq]
            if piece != '.':
                h ^= self.zobrist_keys[piece][sq]
                
        if board.side_to_move == 'b':
            h ^= self.zobrist_keys['black_to_move']
            
        # Castling
        c_index = 0
        if board.castling_rights['K']: c_index |= 1
        if board.castling_rights['Q']: c_index |= 2
        if board.castling_rights['k']: c_index |= 4
        if board.castling_rights['q']: c_index |= 8
        h ^= self.zobrist_keys['castling'][c_index]
        
        if board.en_passant is not None:
            ep_file = board.en_passant % 8
            h ^= self.zobrist_keys['en_passant'][ep_file]
            
        return h

    def store(self, hash_key, depth, score, flag, best_move):
        # Always replace scheme
        self.table[hash_key] = {
            'depth': depth,
            'score': score,
            'flag': flag,
            'best_move': best_move
        }

    def lookup(self, hash_key, depth, alpha, beta):
        entry = self.table.get(hash_key)
        if entry is not None and entry['depth'] >= depth:
            score = entry['score']
            flag = entry['flag']
            
            if flag == self.EXACT:
                return score, entry['best_move']
            elif flag == self.ALPHA and score <= alpha:
                return alpha, entry['best_move']
            elif flag == self.BETA and score >= beta:
                return beta, entry['best_move']
                
        return None, (entry['best_move'] if entry else None)
