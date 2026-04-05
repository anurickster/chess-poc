import { buildCurrentGameContext } from "../utils/chess-state.js";

function dedupeById(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.id ?? item.slug ?? JSON.stringify(item);
    if (!map.has(key) || (item.score ?? 0) > (map.get(key).score ?? 0)) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

export class RetrievalService {
  constructor({ repository, ollamaClient }) {
    this.repository = repository;
    this.ollamaClient = ollamaClient;
  }

  async retrieve({ question, gameSnapshot }) {
    const currentGameCitation = {
      id: `game:${gameSnapshot.gameId}`,
      title: "Current Game State",
      content: buildCurrentGameContext(gameSnapshot),
      source: "current-game",
      score: 1
    };

    const vectorless = await this.repository.searchChunksVectorless(question, 4);
    let vector = [];
    let retrievalMode = "vectorless";

    try {
      const embedding = await this.ollamaClient.embed(question);
      if (Array.isArray(embedding) && embedding.length > 0) {
        vector = await this.repository.searchChunksVector(embedding, 4);
      }
    } catch {
      vector = [];
    }

    if (vector.length > 0 && vectorless.length > 0) {
      retrievalMode = "hybrid";
    } else if (vector.length > 0) {
      retrievalMode = "vector";
    }

    const citations = dedupeById([
      currentGameCitation,
      ...vectorless.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        source: item.slug,
        score: item.score
      })),
      ...vector.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        source: item.slug,
        score: item.score
      }))
    ]).slice(0, 5);

    return {
      retrievalMode,
      citations,
      contextText: citations
        .map((citation, index) => `[${index + 1}] ${citation.title} (${citation.source}): ${citation.content}`)
        .join("\n")
    };
  }
}
