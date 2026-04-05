import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { MemoryRepository } from "../src/repositories/memory-repository.js";
import { GameService } from "../src/services/game-service.js";
import { RetrievalService } from "../src/services/retrieval-service.js";
import { AgentService } from "../src/services/agent-service.js";

class FakeOllamaClient {
  async generate({ prompt }) {
    return `Stub answer based on: ${prompt.split("\n")[0]}`;
  }

  async embed(text) {
    return [text.length, 1, 0];
  }
}

async function buildTestApp() {
  const repository = new MemoryRepository();
  const document = await repository.upsertDocument({
    slug: "test-doc",
    title: "Test Doc",
    body: "Chess coaching text about center control and forcing moves.",
    metadata: {}
  });
  await repository.replaceDocumentChunks(document.id, [
    {
      chunkIndex: 0,
      content: "Control the center and look for forcing moves.",
      embedding: [10, 1, 0]
    }
  ]);

  const ollamaClient = new FakeOllamaClient();
  const gameService = new GameService({ repository });
  const retrievalService = new RetrievalService({ repository, ollamaClient });
  const agentService = new AgentService({ repository, retrievalService, ollamaClient });
  const app = createApp({ gameService, agentService });

  return { app, repository };
}

test("game lifecycle and agent query work through the API", async () => {
  const { app, repository } = await buildTestApp();

  const sessionResponse = await request(app).post("/api/sessions").send({});
  assert.equal(sessionResponse.status, 201);

  const sessionId = sessionResponse.body.sessionId;
  const gameResponse = await request(app).post("/api/games").send({ sessionId, playerColor: "white" });
  assert.equal(gameResponse.status, 201);
  assert.equal(gameResponse.body.playerColor, "white");

  const gameId = gameResponse.body.gameId;
  const firstMove = gameResponse.body.legalMoves.find((move) => move.from === "e2" && move.to === "e4");
  assert.ok(firstMove);

  const moveResponse = await request(app)
    .post(`/api/games/${gameId}/moves`)
    .send({ sessionId, from: "e2", to: "e4" });
  assert.equal(moveResponse.status, 200);
  assert.equal(moveResponse.body.history[0].san, "e4");
  assert.equal(moveResponse.body.history[1].actor, "ai");
  assert.equal(Array.isArray(moveResponse.body.auditEvents), true);
  assert.equal(moveResponse.body.auditEvents.some((event) => event.eventType === "move.human"), true);
  assert.equal(moveResponse.body.auditEvents.some((event) => event.eventType === "move.ai"), true);

  const queryResponse = await request(app)
    .post(`/api/games/${gameId}/agent/query`)
    .send({ sessionId, question: "What is the idea of my last move?" });
  assert.equal(queryResponse.status, 200);
  assert.equal(queryResponse.body.model.length > 0, true);
  assert.equal(queryResponse.body.agentRunId.length > 0, true);
  assert.equal(Array.isArray(queryResponse.body.citations), true);

  const snapshotResponse = await request(app).get(`/api/games/${gameId}`);
  assert.equal(snapshotResponse.status, 200);
  assert.equal(snapshotResponse.body.auditEvents.some((event) => event.eventType === "agent.query"), true);

  assert.equal(repository.auditEvents.length > 0, true);
});

test("illegal moves are rejected", async () => {
  const { app } = await buildTestApp();
  const session = await request(app).post("/api/sessions").send({});
  const game = await request(app).post("/api/games").send({ sessionId: session.body.sessionId, playerColor: "white" });

  const illegalMove = await request(app)
    .post(`/api/games/${game.body.gameId}/moves`)
    .send({ sessionId: session.body.sessionId, from: "e2", to: "e5" });

  assert.equal(illegalMove.status, 400);
  assert.match(illegalMove.body.error, /Invalid move/);
});
