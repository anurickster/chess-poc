import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiRouter } from "./routes/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp({ gameService, agentService }) {
  const app = express();

  app.use(express.json());
  app.use("/api", createApiRouter({ gameService, agentService }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use((error, _request, response, _next) => {
    response.status(400).json({
      error: error.message || "Unexpected error."
    });
  });

  return app;
}
