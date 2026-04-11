import { config } from "../config.js";

function buildTimeoutError(path, timeoutMs) {
  const error = new Error(`Ollama request to ${path} timed out after ${timeoutMs}ms`);
  error.code = "OLLAMA_TIMEOUT";
  return error;
}

function isRetryableOllamaError(error) {
  return (
    error?.code === "OLLAMA_TIMEOUT" ||
    error?.name === "AbortError" ||
    error?.message?.includes("fetch failed") ||
    error?.message?.includes("ECONNREFUSED") ||
    error?.message?.includes("status 502") ||
    error?.message?.includes("status 503") ||
    error?.message?.includes("status 504")
  );
}

function normalizeGenerateResponse(response) {
  const answer = response.response?.trim();
  if (!answer) {
    throw new Error("Ollama returned an empty response.");
  }

  return answer;
}

async function postJson(path, body, timeoutMs = config.ollamaTimeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

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
  } catch (error) {
    if (timedOut && error?.name === "AbortError") {
      throw buildTimeoutError(path, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export class OllamaClient {
  async generate({ system, prompt }) {
    const body = {
      model: config.ollamaChatModel,
      system,
      prompt,
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: 160
      }
    };

    try {
      const response = await postJson("/api/generate", body);
      return normalizeGenerateResponse(response);
    } catch (error) {
      if (!isRetryableOllamaError(error)) {
        throw error;
      }

      const retryTimeoutMs = Math.max(config.ollamaTimeoutMs * 2, 120000);
      const response = await postJson("/api/generate", body, retryTimeoutMs);
      return normalizeGenerateResponse(response);
    }
  }

  async embed(text) {
    const response = await postJson("/api/embeddings", {
      model: config.ollamaEmbedModel,
      prompt: text
    });

    return response.embedding ?? null;
  }
}
