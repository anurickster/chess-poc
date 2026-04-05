import { Chess } from "chess.js";
import { chooseBestMove } from "./minimax.js";
import { config } from "../config.js";
import { createGameSnapshot, deriveGameStatus } from "../utils/chess-state.js";

function actorColorLabel(turn) {
  return turn === "w" ? "white" : "black";
}

function nextMoveNumbers(moves) {
  const ply = moves.length + 1;
  const moveNumber = Math.floor((ply + 1) / 2);
  return { ply, moveNumber };
}

function serializeAppliedMove(chess, appliedMove, actor, moves) {
  const { ply, moveNumber } = nextMoveNumbers(moves);

  return {
    moveNumber,
    ply,
    actor,
    color: actorColorLabel(appliedMove.color),
    fromSquare: appliedMove.from,
    toSquare: appliedMove.to,
    san: appliedMove.san,
    fenAfter: chess.fen(),
    isCheck: chess.inCheck(),
    isCheckmate: chess.isCheckmate(),
    metadata: {
      promotion: appliedMove.promotion ?? null
    }
  };
}

export class GameService {
  constructor({ repository }) {
    this.repository = repository;
  }

  async createSession() {
    const suffix = Math.floor(Math.random() * 9000 + 1000);
    return this.repository.createSession(`guest-${suffix}`);
  }

  async createGame({ sessionId, playerColor = "white" }) {
    if (!["white", "black"].includes(playerColor)) {
      throw new Error("playerColor must be white or black.");
    }

    const session = await this.repository.getSession(sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }

    const aiColor = playerColor === "white" ? "black" : "white";
    const chess = new Chess();
    let game = await this.repository.createGame({
      sessionId,
      playerColor,
      aiColor,
      fen: chess.fen(),
      status: "active",
      currentTurn: "white"
    });

    if (aiColor === "white") {
      const moves = await this.repository.listMoves(game.id);
      await this.applyAiMove({ game, chess, moves });
      game = await this.repository.getGame(game.id);
    }

    return this.getGameSnapshot(game.id);
  }

  async getGameSnapshot(gameId) {
    const game = await this.repository.getGame(gameId);
    if (!game) {
      throw new Error("Game not found.");
    }

    const moves = await this.repository.listMoves(game.id);
    const auditEvents = await this.repository.listAuditEvents(game.id, 12);
    const chess = new Chess(game.fen);
    return createGameSnapshot(chess, game, moves, auditEvents);
  }

  async applyPlayerMove({ gameId, sessionId, from, to, promotion }) {
    const game = await this.repository.getGame(gameId);
    if (!game) {
      throw new Error("Game not found.");
    }

    if (game.session_id !== sessionId) {
      throw new Error("Session does not own this game.");
    }

    const chess = new Chess(game.fen);
    if (chess.isGameOver()) {
      throw new Error("Game is already over.");
    }

    const playerTurn = actorColorLabel(chess.turn());
    if (playerTurn !== game.player_color) {
      throw new Error("It is not the human player's turn.");
    }

    if (!from || !to) {
      throw new Error("Both from and to squares are required.");
    }

    const moves = await this.repository.listMoves(game.id);
    const appliedMove = chess.move({ from, to, promotion });
    if (!appliedMove) {
      throw new Error("Illegal move.");
    }

    const playerMove = serializeAppliedMove(chess, appliedMove, "human", moves);
    await this.repository.appendMove({
      gameId,
      ...playerMove
    });

    await this.repository.addAuditEvent({
      sessionId,
      gameId,
      eventType: "move.human",
      payload: {
        san: appliedMove.san,
        from: appliedMove.from,
        to: appliedMove.to,
        promotion: appliedMove.promotion ?? null
      }
    });

    const afterPlayer = deriveGameStatus(chess);
    await this.repository.updateGameState(gameId, {
      status: afterPlayer.status,
      result: afterPlayer.result,
      currentTurn: actorColorLabel(chess.turn()),
      fen: chess.fen(),
      lastMoveSan: appliedMove.san
    });

    if (!chess.isGameOver() && actorColorLabel(chess.turn()) === game.ai_color) {
      const freshMoves = await this.repository.listMoves(game.id);
      await this.applyAiMove({
        game: await this.repository.getGame(game.id),
        chess,
        moves: freshMoves
      });
    }

    return this.getGameSnapshot(gameId);
  }

  async applyAiMove({ game, chess, moves }) {
    const bestMove = chooseBestMove(chess, game.ai_color, config.minimaxDepth);
    if (!bestMove) {
      return null;
    }

    const appliedMove = chess.move(bestMove);
    const aiMove = serializeAppliedMove(chess, appliedMove, "ai", moves);

    await this.repository.appendMove({
      gameId: game.id,
      ...aiMove
    });

    const status = deriveGameStatus(chess);
    await this.repository.updateGameState(game.id, {
      status: status.status,
      result: status.result,
      currentTurn: actorColorLabel(chess.turn()),
      fen: chess.fen(),
      lastMoveSan: appliedMove.san
    });

    await this.repository.addAuditEvent({
      sessionId: game.session_id,
      gameId: game.id,
      eventType: "move.ai",
      payload: {
        san: appliedMove.san,
        from: appliedMove.from,
        to: appliedMove.to,
        minimaxDepth: config.minimaxDepth
      }
    });

    return appliedMove;
  }
}
