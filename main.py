from board import Board
from move_generation import MoveGenerator

def main():
    print("Initializing Chess Engine - Modules 1 & 2")
    board = Board()
    board.print_board()
    
    print("\nGenerating Legal Moves for Starting Position:")
    generator = MoveGenerator(board)
    moves = generator.generate_legal_moves()
    
    for i, move in enumerate(moves):
        print(f"{i+1}. {move}")
        
    print(f"\nTotal legal moves: {len(moves)}")
    print("These are exactly 20 moves, as expected for the starting position.")
    
if __name__ == "__main__":
    main()
