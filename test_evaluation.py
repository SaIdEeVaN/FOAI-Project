from board import Board
from evaluation import Evaluation

def main():
    board = Board()
    evaluator = Evaluation()
    
    print("Initial Board State:")
    board.print_board()
    
    score = evaluator.evaluate(board)
    print(f"Evaluation Score for initial position (White to move): {score}")
    
if __name__ == "__main__":
    main()
