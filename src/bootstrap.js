import { createApp } from "./app.js";
import { PostgresRepository } from "./repositories/postgres-repository.js";
import { GameService } from "./services/game-service.js";
import { OllamaClient } from "./services/ollama-client.js";
import { RetrievalService } from "./services/retrieval-service.js";
import { AgentService } from "./services/agent-service.js";
import { InternetChessService } from "./services/internet-chess-service.js";

const repository = new PostgresRepository();
const ollamaClient = new OllamaClient();
const retrievalService = new RetrievalService({ repository, ollamaClient });
const gameService = new GameService({ repository });
const internetChessService = new InternetChessService();
const agentService = new AgentService({ repository, retrievalService, ollamaClient, internetChessService });

export const app = createApp({ gameService, agentService });

export default app;
