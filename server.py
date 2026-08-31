"""
Module 4: Flask Web Server Backend
Exposes the chess engine as a REST API for the frontend.
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os

from controller import GameController

app = Flask(__name__, static_folder="static")
CORS(app)

# Single game controller instance (one game at a time)
gc = GameController()

# ---------------------------------------------------------------------------
# Serve the frontend
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/style.css")
def serve_css():
    return send_from_directory("static", "style.css")

@app.route("/app.js")
def serve_js():
    return send_from_directory("static", "app.js")

# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.route("/api/new_game", methods=["POST"])
def new_game():
    """Start a fresh game. Optionally accepts a FEN in JSON body."""
    data = request.get_json(silent=True) or {}
    fen = data.get("fen", None)
    gc.reset(fen=fen)
    return jsonify({"ok": True, "board_state": gc.get_board_state()})


@app.route("/api/board", methods=["GET"])
def get_board():
    """Return the current board state."""
    return jsonify(gc.get_board_state())


@app.route("/api/legal_moves/<int:sq>", methods=["GET"])
def legal_moves(sq):
    """Return all legal target squares for the piece on square *sq*."""
    targets = gc.get_legal_moves_for_square(sq)
    return jsonify({"ok": True, "targets": targets})


@app.route("/api/player_move", methods=["POST"])
def player_move():
    """
    Apply a human player's move.
    Body: { "uci": "e2e4" }
    """
    data = request.get_json(silent=True) or {}
    uci = data.get("uci", "")
    result = gc.apply_player_move(uci)
    return jsonify(result)


@app.route("/api/engine_move", methods=["POST"])
def engine_move():
    """
    Ask the engine to compute and apply its move.
    Body (optional): { "time_limit": 2.0 }
    """
    data = request.get_json(silent=True) or {}
    time_limit = float(data.get("time_limit", 2.0))
    result = gc.request_engine_move(time_limit=time_limit)
    return jsonify(result)


@app.route("/api/undo", methods=["POST"])
def undo():
    """Undo the last two half-moves (player + engine)."""
    if len(gc.board.history) < 2:
        return jsonify({"ok": False, "error": "Not enough moves to undo."})
    # Undo engine move then player move
    from move_generation import MoveGenerator
    gen = MoveGenerator(gc.board)
    # We stored position snapshots — restore last two
    for _ in range(min(2, len(gc.move_history))):
        if gc.board.history:
            # We use the board's own unmake mechanism
            # Reconstruct the move from history is complex; simplest is full reset + replay
            pass
    # Simple approach: reset and replay all moves except last two
    moves_to_replay = gc.move_history[:-2]
    gc.reset()
    for uci in moves_to_replay:
        gc.apply_player_move(uci)
    return jsonify({"ok": True, "board_state": gc.get_board_state()})


if __name__ == "__main__":
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    os.makedirs(static_dir, exist_ok=True)
    print("Chess Engine Server running at http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
