from board import Board
from search import SearchEngine

def main():
    # Setup initial board
    board = Board()
    print("Initial Board State:")
    board.print_board()
    
    # We can use a FEN string for a specific position if we want,
    # but let's just search the initial position for 3 seconds.
    print("\n--- Starting Search Engine ---")
    engine = SearchEngine(board)
    
    # Get the best move within a 3-second time limit
    best_move, max_depth, total_nodes, score = engine.get_best_move(time_limit=3.0)
    
    print("\n--- Search Results ---")
    print(f"Best Move: {best_move}")
    print(f"Max Depth Reached: {max_depth}")
    print(f"Total Nodes Expanded: {total_nodes}")
    print(f"Final Evaluation Score: {score}")

if __name__ == "__main__":
    main()
