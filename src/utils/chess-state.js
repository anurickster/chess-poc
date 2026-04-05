import { Chess } from "chess.js";

export function getColorLabel(turn) {
  return turn === "w" ? "white" : "black";
}

export function deriveGameStatus(chess) {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "black" : "white";

    return {
      status: "checkmate",
      result: winner
    };
  }

  if (chess.isStalemate()) {
    return { status: "stalemate", result: "draw" };
  }

  if (chess.isThreefoldRepetition()) {
    return { status: "threefold-repetition", result: "draw" };
  }

  if (chess.isInsufficientMaterial()) {
    return { status: "insufficient-material", result: "draw" };
  }

  if (chess.isDraw()) {
    return { status: "draw", result: "draw" };
  }

  if (chess.inCheck()) {
    return { status: "check", result: null };
  }

  return { status: "active", result: null };
}

export function createGameSnapshot(chess, game, moves, auditEvents = []) {
  const { status, result } = deriveGameStatus(chess);
  const legalMoves = chess
    .moves({ verbose: true })
    .map((move) => ({
      from: move.from,
      to: move.to,
      san: move.san,
      promotion: move.promotion ?? null
    }));
  const latestMove = moves.at(-1);

  return {
    gameId: game.id,
    sessionId: game.session_id,
    playerColor: game.player_color,
    aiColor: game.ai_color,
    fen: chess.fen(),
    status,
    result,
    turn: getColorLabel(chess.turn()),
    inCheck: chess.inCheck(),
    isGameOver: chess.isGameOver(),
    legalMoves,
    lastMove: latestMove
      ? {
          moveId: latestMove.id,
          ply: latestMove.ply,
          moveNumber: latestMove.move_number,
          actor: latestMove.actor,
          color: latestMove.color,
          from: latestMove.from_square,
          to: latestMove.to_square,
          san: latestMove.san,
          promotion: latestMove.metadata?.promotion ?? null,
          isCheck: latestMove.is_check,
          isCheckmate: latestMove.is_checkmate,
          createdAt: latestMove.created_at
        }
      : null,
    history: moves.map((move) => ({
      moveId: move.id,
      ply: move.ply,
      moveNumber: move.move_number,
      actor: move.actor,
      color: move.color,
      from: move.from_square,
      to: move.to_square,
      san: move.san,
      promotion: move.metadata?.promotion ?? null,
      isCheck: move.is_check,
      isCheckmate: move.is_checkmate,
      createdAt: move.created_at
    })),
    auditEvents: auditEvents.map((event) => ({
      auditEventId: event.id,
      agentRunId: event.agent_run_id,
      eventType: event.event_type,
      payload: event.payload,
      createdAt: event.created_at
    }))
  };
}

export function loadChessFromFen(fen) {
  return new Chess(fen);
}

export function buildCurrentGameContext(gameSnapshot) {
  const historyText =
    gameSnapshot.history.length === 0
      ? "No moves have been played yet."
      : gameSnapshot.history
          .map((move) => `Ply ${move.ply}: ${move.actor} played ${move.san} (${move.from}-${move.to}).`)
          .join(" ");

  return [
    `Game ${gameSnapshot.gameId}.`,
    `Player color: ${gameSnapshot.playerColor}. AI color: ${gameSnapshot.aiColor}.`,
    `Current turn: ${gameSnapshot.turn}. Status: ${gameSnapshot.status}. Result: ${gameSnapshot.result ?? "pending"}.`,
    `Current FEN: ${gameSnapshot.fen}.`,
    `Move history: ${historyText}`
  ].join(" ");
}
