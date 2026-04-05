import { randomUUID } from "node:crypto";

export class MemoryRepository {
  constructor() {
    this.sessions = new Map();
    this.games = new Map();
    this.moves = new Map();
    this.documents = new Map();
    this.documentBySlug = new Map();
    this.chunks = [];
    this.agentRuns = new Map();
    this.auditEvents = [];
  }

  async createSession(displayName) {
    const session = {
      id: randomUUID(),
      display_name: displayName,
      created_at: new Date().toISOString()
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async getSession(sessionId) {
    return this.sessions.get(sessionId) ?? null;
  }

  async createGame({ sessionId, playerColor, aiColor, fen, status, currentTurn }) {
    const game = {
      id: randomUUID(),
      session_id: sessionId,
      player_color: playerColor,
      ai_color: aiColor,
      status,
      result: null,
      current_turn: currentTurn,
      fen,
      last_move_san: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.games.set(game.id, game);
    this.moves.set(game.id, []);
    return game;
  }

  async getGame(gameId) {
    return this.games.get(gameId) ?? null;
  }

  async listMoves(gameId) {
    return [...(this.moves.get(gameId) ?? [])];
  }

  async appendMove(move) {
    const record = {
      id: randomUUID(),
      game_id: move.gameId,
      move_number: move.moveNumber,
      ply: move.ply,
      actor: move.actor,
      color: move.color,
      from_square: move.fromSquare,
      to_square: move.toSquare,
      san: move.san,
      fen_after: move.fenAfter,
      is_check: move.isCheck,
      is_checkmate: move.isCheckmate,
      metadata: move.metadata ?? {},
      created_at: new Date().toISOString()
    };
    this.moves.set(move.gameId, [...(this.moves.get(move.gameId) ?? []), record]);
    return record;
  }

  async updateGameState(gameId, state) {
    const game = this.games.get(gameId);
    const updated = {
      ...game,
      status: state.status,
      result: state.result,
      current_turn: state.currentTurn,
      fen: state.fen,
      last_move_san: state.lastMoveSan,
      updated_at: new Date().toISOString()
    };
    this.games.set(gameId, updated);
    return updated;
  }

  async createAgentRun(run) {
    const record = {
      id: randomUUID(),
      session_id: run.sessionId,
      game_id: run.gameId,
      prompt_class: run.promptClass,
      query: run.query,
      answer: run.answer,
      model: run.model,
      retrieval_mode: run.retrievalMode,
      citations: run.citations,
      created_at: new Date().toISOString()
    };
    this.agentRuns.set(record.id, record);
    return record;
  }

  async addAuditEvent(event) {
    const record = {
      id: randomUUID(),
      session_id: event.sessionId ?? null,
      game_id: event.gameId ?? null,
      agent_run_id: event.agentRunId ?? null,
      event_type: event.eventType,
      payload: event.payload ?? {},
      created_at: new Date().toISOString()
    };
    this.auditEvents.push(record);
    return record;
  }

  async listAuditEvents(gameId, limit = 10) {
    return this.auditEvents
      .filter((event) => event.game_id === gameId)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, limit);
  }

  async upsertDocument({ slug, title, body, metadata }) {
    const existingId = this.documentBySlug.get(slug);
    const document = {
      id: existingId ?? randomUUID(),
      slug,
      title,
      body,
      metadata: metadata ?? {},
      approved: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.documentBySlug.set(slug, document.id);
    this.documents.set(document.id, document);
    return document;
  }

  async replaceDocumentChunks(documentId, chunks) {
    this.chunks = this.chunks.filter((chunk) => chunk.document_id !== documentId);
    for (const chunk of chunks) {
      this.chunks.push({
        id: randomUUID(),
        document_id: documentId,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        metadata: chunk.metadata ?? {},
        embedding: chunk.embedding ?? null
      });
    }
  }

  async searchChunksVectorless(queryText, limit = 5) {
    const queryTerms = queryText.toLowerCase().split(/\s+/).filter(Boolean);
    return this.chunks
      .map((chunk) => {
        const content = chunk.content.toLowerCase();
        const score = queryTerms.reduce((total, term) => total + (content.includes(term) ? 1 : 0), 0);
        const document = this.documents.get(chunk.document_id);
        return {
          ...chunk,
          slug: document.slug,
          title: document.title,
          score
        };
      })
      .filter((chunk) => chunk.score > 0)
      .sort((left, right) => right.score - left.score || left.chunk_index - right.chunk_index)
      .slice(0, limit);
  }

  async searchChunksVector(embedding, limit = 5) {
    const scoreChunk = (chunkEmbedding) =>
      chunkEmbedding.reduce((total, value, index) => total + value * embedding[index], 0);

    return this.chunks
      .filter((chunk) => Array.isArray(chunk.embedding))
      .map((chunk) => {
        const document = this.documents.get(chunk.document_id);
        return {
          ...chunk,
          slug: document.slug,
          title: document.title,
          score: scoreChunk(chunk.embedding)
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}
