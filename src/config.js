import dotenv from "dotenv";

dotenv.config();

const isVercel = Boolean(process.env.VERCEL);
const configuredOllamaBaseUrl = process.env.OLLAMA_BASE_URL?.trim() || "";
const defaultOllamaBaseUrl = isVercel ? "" : "http://localhost:11434";
const ollamaBaseUrl = configuredOllamaBaseUrl || defaultOllamaBaseUrl;
const ollamaEnabled =
  process.env.OLLAMA_ENABLED === "false"
    ? false
    : Boolean(ollamaBaseUrl) && !(isVercel && /localhost|127\.0\.0\.1/i.test(ollamaBaseUrl));

export const config = {
  isVercel,
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/chessmoves_byoa",
  minimaxDepth: Number(process.env.MINIMAX_DEPTH || 2),
  ollamaEnabled,
  ollamaBaseUrl,
  ollamaChatModel: process.env.OLLAMA_CHAT_MODEL || "qwen2.5:3b",
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || (isVercel ? 8000 : 60000)),
  embeddingDim: Number(process.env.EMBEDDING_DIM || 768),
  lichessBaseUrl: process.env.LICHESS_BASE_URL || "https://lichess.org",
  lichessMastersUrl: process.env.LICHESS_MASTERS_URL || "https://explorer.lichess.ovh/masters",
  lichessApiToken: process.env.LICHESS_API_TOKEN || "",
  internetAnalysisTimeoutMs: Number(process.env.INTERNET_ANALYSIS_TIMEOUT_MS || 12000)
};
