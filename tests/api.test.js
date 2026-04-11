import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { MemoryRepository } from "../src/repositories/memory-repository.js";
import { GameService } from "../src/services/game-service.js";
import { RetrievalService } from "../src/services/retrieval-service.js";
import { AgentService } from "../src/services/agent-service.js";
import { OllamaClient } from "../src/services/ollama-client.js";
import { config } from "../src/config.js";

class FakeOllamaClient {
  async generate({ prompt }) {
    return `Stub answer based on: ${prompt.split("\n")[0]}`;
  }

  async embed(text) {
    return [text.length, 1, 0];
  }
}

async function buildTestApp({ ollamaClient = new FakeOllamaClient() } = {}) {
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

test("agent query returns a deterministic fallback when generation fails", async () => {
  class FailingOllamaClient extends FakeOllamaClient {
    async generate() {
      throw new Error("Simulated Ollama outage");
    }
  }

  const { app } = await buildTestApp({ ollamaClient: new FailingOllamaClient() });
  const sessionResponse = await request(app).post("/api/sessions").send({});
  const gameResponse = await request(app).post("/api/games").send({ sessionId: sessionResponse.body.sessionId, playerColor: "white" });

  const queryResponse = await request(app)
    .post(`/api/games/${gameResponse.body.gameId}/agent/query`)
    .send({ sessionId: sessionResponse.body.sessionId, question: "I want to win" });

  assert.equal(queryResponse.status, 200);
  assert.match(queryResponse.body.answer, /language model is unavailable/i);
  assert.match(queryResponse.body.answer, /\[1\]/);
});

test("ollama client retries a transient generate failure once", async () => {
  const originalFetch = global.fetch;
  const originalIsVercel = config.isVercel;
  const originalOllamaEnabled = config.ollamaEnabled;
  const originalOllamaTimeoutMs = config.ollamaTimeoutMs;
  let calls = 0;

  config.isVercel = false;
  config.ollamaEnabled = true;
  config.ollamaTimeoutMs = 50;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      throw new TypeError("fetch failed");
    }

    return {
      ok: true,
      json: async () => ({
        response: "Recovered answer"
      })
    };
  };

  try {
    const ollamaClient = new OllamaClient();
    const answer = await ollamaClient.generate({ system: "test system", prompt: "test prompt" });
    assert.equal(answer, "Recovered answer");
    assert.equal(calls, 2);
  } finally {
    config.isVercel = originalIsVercel;
    config.ollamaEnabled = originalOllamaEnabled;
    config.ollamaTimeoutMs = originalOllamaTimeoutMs;
    global.fetch = originalFetch;
  }
});

test("ollama client returns null embeddings when disabled", async () => {
  const originalOllamaEnabled = config.ollamaEnabled;
  config.ollamaEnabled = false;

  try {
    const ollamaClient = new OllamaClient();
    const embedding = await ollamaClient.embed("center control");
    assert.equal(embedding, null);
  } finally {
    config.ollamaEnabled = originalOllamaEnabled;
  }
});
