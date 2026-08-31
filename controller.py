"""
Module 3: Engine Controller & Telemetry Formatter
Manages game state, move history, clock, and packages
the AI's search output into clean telemetry data.
"""

from board import Board
from move_generation import MoveGenerator
from search import SearchEngine


class GameController:
    def __init__(self):
        self.board = Board()
        self.engine = SearchEngine(self.board)
        self.generator = MoveGenerator(self.board)
        self.move_history = []          # list of UCI strings
        self.position_history = []      # list of board square snapshots
        self.game_over = False
        self.result = None              # "1-0" | "0-1" | "1/2-1/2"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def reset(self, fen=None):
        """Start a fresh game (optionally from a FEN position)."""
        self.board = Board()
        if fen:
            self.board.parse_fen(fen)
        self.engine = SearchEngine(self.board)
        self.generator = MoveGenerator(self.board)
        self.move_history = []
        self.position_history = []
        self.game_over = False
        self.result = None

    def get_board_state(self):
        """Return the full board state in a JSON-friendly dict."""
        return {
            "squares": self.board.squares[:],          # 64-element list
            "side_to_move": self.board.side_to_move,
            "castling_rights": self.board.castling_rights.copy(),
            "en_passant": self.board.en_passant,
            "half_move_clock": self.board.half_move_clock,
            "full_move_number": self.board.full_move_number,
            "move_history": self.move_history[:],
            "game_over": self.game_over,
            "result": self.result,
        }

    def get_legal_moves_for_square(self, sq):
        """Return all legal target squares for the piece on *sq*."""
        self.generator.board = self.board
        legal = self.generator.generate_legal_moves()
        return [m.target_sq for m in legal if m.start_sq == sq]

    def apply_player_move(self, uci_str):
        """
        Apply a human-submitted move (UCI notation, e.g. 'e2e4').
        Returns a dict with keys:  ok, error, board_state
        """
        if self.game_over:
            return {"ok": False, "error": "Game is already over."}

        move_obj = self._uci_to_move(uci_str)
        if move_obj is None:
            return {"ok": False, "error": f"Illegal or unknown move: {uci_str}"}

        self._commit_move(move_obj)
        status = self._detect_game_end()

        return {
            "ok": True,
            "move": uci_str,
            "board_state": self.get_board_state(),
            "status": status,
        }

    def request_engine_move(self, time_limit=2.0):
        """
        Ask the AI to compute and play a move.
        Returns a rich telemetry dict.
        """
        if self.game_over:
            return {"ok": False, "error": "Game is already over.", "telemetry": None}

        self.engine.board = self.board
        best_move, max_depth, total_nodes, score = self.engine.get_best_move(
            time_limit=time_limit
        )

        if best_move is None:
            status = self._detect_game_end()
            return {"ok": False, "error": "Engine found no moves.", "status": status, "telemetry": None}

        uci_str = best_move.to_uci()
        self._commit_move(best_move)
        status = self._detect_game_end()

        telemetry = self._build_telemetry(uci_str, max_depth, total_nodes, score)

        return {
            "ok": True,
            "move": uci_str,
            "board_state": self.get_board_state(),
            "telemetry": telemetry,
            "status": status,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _commit_move(self, move_obj):
        self.position_history.append(self.board.squares[:])
        self.board.make_move(move_obj)
        self.generator.board = self.board
        self.move_history.append(move_obj.to_uci())

    def _detect_game_end(self):
        self.generator.board = self.board
        legal = self.generator.generate_legal_moves()

        if not legal:
            in_check = self.generator.is_in_check(self.board.side_to_move)
            if in_check:
                # The side to move is checkmated
                self.game_over = True
                self.result = "0-1" if self.board.side_to_move == "w" else "1-0"
                winner = "Black" if self.board.side_to_move == "w" else "White"
                return {"type": "checkmate", "winner": winner, "result": self.result}
            else:
                self.game_over = True
                self.result = "1/2-1/2"
                return {"type": "stalemate", "result": self.result}

        if self.board.half_move_clock >= 100:
            self.game_over = True
            self.result = "1/2-1/2"
            return {"type": "fifty_move_rule", "result": self.result}

        if self._is_insufficient_material():
            self.game_over = True
            self.result = "1/2-1/2"
            return {"type": "insufficient_material", "result": self.result}

        return {"type": "ongoing"}

    def _is_insufficient_material(self):
        pieces = [p for p in self.board.squares if p != "."]
        types = set(p.lower() for p in pieces)
        # King vs King
        if types == {"k"}:
            return True
        # King + Bishop/Knight vs King
        if types <= {"k", "b"} or types <= {"k", "n"}:
            if len(pieces) <= 3:
                return True
        return False

    def _uci_to_move(self, uci_str):
        """Convert UCI string to a Move object from the legal moves list."""
        self.generator.board = self.board
        legal = self.generator.generate_legal_moves()
        for m in legal:
            if m.to_uci() == uci_str:
                return m
        return None

    def _build_telemetry(self, uci_str, max_depth, total_nodes, score):
        side = "White" if self.board.side_to_move == "w" else "Black"
        # Score is always from the perspective of the side that just moved
        display_score = score if self.board.side_to_move == "b" else -score

        return {
            "move_played": uci_str,
            "depth_searched": max_depth,
            "nodes_expanded": total_nodes,
            "evaluation_score": display_score,
            "evaluation_unit": "centipawns",
            "side_to_move_after": side,
            "move_number": self.board.full_move_number,
            "total_moves_played": len(self.move_history),
        }


# ------------------------------------------------------------------
# Quick self-test
# ------------------------------------------------------------------
if __name__ == "__main__":
    gc = GameController()
    print("Board ready. Requesting engine move (White)...")
    result = gc.request_engine_move(time_limit=2.0)
    print(f"Engine played: {result['move']}")
    print(f"Telemetry: {result['telemetry']}")
