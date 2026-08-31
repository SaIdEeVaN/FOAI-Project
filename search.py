import time
from move_generation import MoveGenerator
from evaluation import Evaluation
from transposition import TranspositionTable

class SearchEngine:
    def __init__(self, board):
        self.board = board
        self.evaluator = Evaluation()
        self.tt = TranspositionTable()
        self.nodes_expanded = 0
        self.max_depth_reached = 0
        
        # MVV-LVA (Most Valuable Victim - Least Valuable Attacker) values
        self.piece_values = {'P':1, 'N':3, 'B':3, 'R':5, 'Q':9, 'K':100,
                             'p':1, 'n':3, 'b':3, 'r':5, 'q':9, 'k':100, '.':0}

    def get_best_move(self, time_limit=2.0):
        # Iterative Deepening
        best_move = None
        self.nodes_expanded = 0
        start_time = time.time()
        final_score = 0
        
        depth = 1
        while True:
            # Time check
            if time.time() - start_time > time_limit:
                break
                
            self.max_depth_reached = depth
            score, move = self.negamax_root(depth, -float('inf'), float('inf'))
            
            if move is not None:
                best_move = move
                final_score = score
                
            print(f"Info: Depth {depth} | Score: {score} | Nodes: {self.nodes_expanded} | Time: {time.time()-start_time:.2f}s | PV: {best_move}")
            depth += 1
            
        return best_move, self.max_depth_reached, self.nodes_expanded, final_score

    def negamax_root(self, depth, alpha, beta):
        generator = MoveGenerator(self.board)
        moves = generator.generate_legal_moves()
        
        if not moves:
            return 0, None
            
        hash_key = self.tt.compute_hash(self.board)
        _, tt_best_move = self.tt.lookup(hash_key, depth, alpha, beta)
        
        moves = self.order_moves(moves, tt_best_move)
        
        best_move = None
        best_score = -float('inf')
        
        for move in moves:
            self.board.make_move(move)
            score = -self.negamax(depth - 1, -beta, -alpha)
            self.board.unmake_move(move)
            
            if score > best_score:
                best_score = score
                best_move = move
                
            if score > alpha:
                alpha = score
                
        self.tt.store(hash_key, depth, best_score, self.tt.EXACT, best_move)
        return best_score, best_move

    def negamax(self, depth, alpha, beta):
        self.nodes_expanded += 1
        
        hash_key = self.tt.compute_hash(self.board)
        tt_val, tt_best_move = self.tt.lookup(hash_key, depth, alpha, beta)
        if tt_val is not None:
            return tt_val
            
        if depth == 0:
            return self.quiescence_search(alpha, beta)
            
        generator = MoveGenerator(self.board)
        moves = generator.generate_legal_moves()
        
        if not moves:
            if generator.is_in_check(self.board.side_to_move):
                return -20000 + self.max_depth_reached - depth # Checkmate, prefer faster mate
            else:
                return 0 # Stalemate
                
        moves = self.order_moves(moves, tt_best_move)
        
        best_score = -float('inf')
        original_alpha = alpha
        best_move = None
        
        for move in moves:
            self.board.make_move(move)
            score = -self.negamax(depth - 1, -beta, -alpha)
            self.board.unmake_move(move)
            
            if score > best_score:
                best_score = score
                best_move = move
                
            if score > alpha:
                alpha = score
                
            if alpha >= beta: # Alpha-Beta Pruning
                break
                
        flag = self.tt.EXACT
        if best_score <= original_alpha:
            flag = self.tt.ALPHA
        elif best_score >= beta:
            flag = self.tt.BETA
            
        self.tt.store(hash_key, depth, best_score, flag, best_move)
        return best_score

    def quiescence_search(self, alpha, beta):
        self.nodes_expanded += 1
        stand_pat = self.evaluator.evaluate(self.board)
        
        if stand_pat >= beta:
            return beta
        if alpha < stand_pat:
            alpha = stand_pat
            
        generator = MoveGenerator(self.board)
        moves = generator.generate_legal_moves()
        
        # Filter for tactical moves (captures)
        capture_moves = [m for m in moves if m.piece_captured != '.']
        capture_moves = self.order_moves(capture_moves, None)
        
        for move in capture_moves:
            self.board.make_move(move)
            score = -self.quiescence_search(-beta, -alpha)
            self.board.unmake_move(move)
            
            if score >= beta:
                return beta
            if score > alpha:
                alpha = score
                
        return alpha

    def order_moves(self, moves, tt_best_move):
        def move_score(move):
            score = 0
            if tt_best_move and move == tt_best_move:
                score = 10000 # Play Transposition Table best move first
                
            # MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
            if move.piece_captured != '.':
                victim_val = self.piece_values[move.piece_captured.lower()]
                attacker_val = self.piece_values[move.piece_moved.lower()]
                score += 100 + victim_val * 10 - attacker_val
                
            # Pawn Promotion bonus
            if move.promotion_piece != '.':
                score += 50
                
            return score
            
        return sorted(moves, key=move_score, reverse=True)
