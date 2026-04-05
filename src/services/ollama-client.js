import { config } from "../config.js";

async function postJson(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ollamaTimeoutMs);

  try {
    const response = await fetch(`${config.ollamaBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export class OllamaClient {
  async generate({ system, prompt }) {
    const response = await postJson("/api/generate", {
      model: config.ollamaChatModel,
      system,
      prompt,
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: 96
      }
    });

    return response.response?.trim();
  }

  async embed(text) {
    const response = await postJson("/api/embeddings", {
      model: config.ollamaEmbedModel,
      prompt: text
    });

    return response.embedding ?? null;
  }
}
