import { deriveGameStatus } from "../utils/chess-state.js";

const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000
};

function evaluateBoard(chess, maximizingColor) {
  const board = chess.board();
  let score = 0;

  for (const row of board) {
    for (const square of row) {
      if (!square) {
        continue;
      }

      const value = PIECE_VALUES[square.type] ?? 0;
      score += square.color === maximizingColor ? value : -value;
    }
  }

  const status = deriveGameStatus(chess);
  if (status.status === "checkmate") {
    return status.result === (maximizingColor === "w" ? "white" : "black") ? 1_000_000 : -1_000_000;
  }

  if (status.result === "draw") {
    return 0;
  }

  const mobility = chess.moves().length;
  return score + (chess.turn() === maximizingColor ? mobility : -mobility);
}

function sortedMoves(chess) {
  return chess
    .moves({ verbose: true })
    .sort((left, right) =>
      `${left.from}${left.to}${left.promotion ?? ""}${left.san}`.localeCompare(
        `${right.from}${right.to}${right.promotion ?? ""}${right.san}`
      )
    );
}

function minimax(chess, depth, alpha, beta, maximizingPlayer, maximizingColor) {
  if (depth === 0 || chess.isGameOver()) {
    return { score: evaluateBoard(chess, maximizingColor), move: null };
  }

  const moves = sortedMoves(chess);
  if (maximizingPlayer) {
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestMove = null;

    for (const move of moves) {
      chess.move(move);
      const result = minimax(chess, depth - 1, alpha, beta, false, maximizingColor);
      chess.undo();

      if (result.score > bestScore) {
        bestScore = result.score;
        bestMove = move;
      }

      alpha = Math.max(alpha, bestScore);
      if (beta <= alpha) {
        break;
      }
    }

    return { score: bestScore, move: bestMove };
  }

  let bestScore = Number.POSITIVE_INFINITY;
  let bestMove = null;

  for (const move of moves) {
    chess.move(move);
    const result = minimax(chess, depth - 1, alpha, beta, true, maximizingColor);
    chess.undo();

    if (result.score < bestScore) {
      bestScore = result.score;
      bestMove = move;
    }

    beta = Math.min(beta, bestScore);
    if (beta <= alpha) {
      break;
    }
  }

  return { score: bestScore, move: bestMove };
}

export function chooseBestMove(chess, aiColor, depth) {
  const maximizingColor = aiColor === "white" ? "w" : "b";
  const maximizingPlayer = chess.turn() === maximizingColor;
  const { move } = minimax(
    chess,
    depth,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    maximizingPlayer,
    maximizingColor
  );

  return move;
}
