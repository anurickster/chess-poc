import express from "express";

function asyncRoute(handler) {
  return async (request, response, next) => {
    try {
      await handler(request, response);
    } catch (error) {
      next(error);
    }
  };
}

export function createApiRouter({ gameService, agentService }) {
  const router = express.Router();

  router.post(
    "/sessions",
    asyncRoute(async (_request, response) => {
      const session = await gameService.createSession();
      response.status(201).json({
        sessionId: session.id,
        displayName: session.display_name,
        createdAt: session.created_at
      });
    })
  );

  router.post(
    "/games",
    asyncRoute(async (request, response) => {
      const { sessionId, playerColor = "white" } = request.body ?? {};
      if (!sessionId) {
        throw new Error("sessionId is required.");
      }
      const snapshot = await gameService.createGame({ sessionId, playerColor });
      response.status(201).json(snapshot);
    })
  );

  router.get(
    "/games/:gameId",
    asyncRoute(async (request, response) => {
      const snapshot = await gameService.getGameSnapshot(request.params.gameId);
      response.json(snapshot);
    })
  );

  router.post(
    "/games/:gameId/moves",
    asyncRoute(async (request, response) => {
      const { sessionId, from, to, promotion } = request.body ?? {};
      if (!sessionId) {
        throw new Error("sessionId is required.");
      }
      const snapshot = await gameService.applyPlayerMove({
        gameId: request.params.gameId,
        sessionId,
        from,
        to,
        promotion
      });
      response.json(snapshot);
    })
  );

  router.post(
    "/games/:gameId/agent/query",
    asyncRoute(async (request, response) => {
      const { sessionId, question } = request.body ?? {};
      if (!sessionId) {
        throw new Error("sessionId is required.");
      }
      if (!question?.trim()) {
        throw new Error("question is required.");
      }
      const gameSnapshot = await gameService.getGameSnapshot(request.params.gameId);

      if (gameSnapshot.sessionId !== sessionId) {
        throw new Error("Session does not own this game.");
      }

      const answer = await agentService.answerQuestion({
        sessionId,
        gameId: request.params.gameId,
        question,
        gameSnapshot
      });

      response.json(answer);
    })
  );

  return router;
}
