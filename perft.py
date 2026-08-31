import time
from board import Board
from move_generation import MoveGenerator

def perft(board, depth):
    if depth == 0:
        return 1
        
    generator = MoveGenerator(board)
    moves = generator.generate_legal_moves()
    
    nodes = 0
    for move in moves:
        board.make_move(move)
        nodes += perft(board, depth - 1)
        board.unmake_move(move)
        
    return nodes

def perft_divide(board, depth):
    if depth == 0:
        return 1
        
    print(f"--- Perft {depth} ---")
    start_time = time.time()
    
    generator = MoveGenerator(board)
    moves = generator.generate_legal_moves()
    
    total_nodes = 0
    for move in moves:
        board.make_move(move)
        nodes = perft(board, depth - 1)
        board.unmake_move(move)
        
        print(f"{move}: {nodes}")
        total_nodes += nodes
        
    end_time = time.time()
    print(f"\nNodes searched: {total_nodes}")
    print(f"Time taken: {end_time - start_time:.3f}s")
    print(f"NPS: {int(total_nodes / (end_time - start_time)) if end_time - start_time > 0 else 0}")
    
    return total_nodes

if __name__ == "__main__":
    board = Board()
    board.print_board()
    # Starting position at depth 1 should have 20 moves, depth 2 = 400, depth 3 = 8902, depth 4 = 197281
    perft_divide(board, 3)
