import { pool } from "../db/pool.js";

function toVectorLiteral(values) {
  return `[${values.join(",")}]`;
}

export class PostgresRepository {
  async createSession(displayName) {
    const result = await pool.query(
      `INSERT INTO sessions (display_name) VALUES ($1) RETURNING id, display_name, created_at`,
      [displayName]
    );

    return result.rows[0];
  }

  async getSession(sessionId) {
    const result = await pool.query(`SELECT * FROM sessions WHERE id = $1`, [sessionId]);
    return result.rows[0] ?? null;
  }

  async createGame({ sessionId, playerColor, aiColor, fen, status, currentTurn }) {
    const result = await pool.query(
      `INSERT INTO games (session_id, player_color, ai_color, status, current_turn, fen)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [sessionId, playerColor, aiColor, status, currentTurn, fen]
    );

    return result.rows[0];
  }

  async getGame(gameId) {
    const result = await pool.query(`SELECT * FROM games WHERE id = $1`, [gameId]);
    return result.rows[0] ?? null;
  }

  async listMoves(gameId) {
    const result = await pool.query(`SELECT * FROM moves WHERE game_id = $1 ORDER BY ply ASC`, [gameId]);
    return result.rows;
  }

  async appendMove(move) {
    const result = await pool.query(
      `INSERT INTO moves (
         game_id, move_number, ply, actor, color, from_square, to_square, san, fen_after, is_check, is_checkmate, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       RETURNING *`,
      [
        move.gameId,
        move.moveNumber,
        move.ply,
        move.actor,
        move.color,
        move.fromSquare,
        move.toSquare,
        move.san,
        move.fenAfter,
        move.isCheck,
        move.isCheckmate,
        JSON.stringify(move.metadata ?? {})
      ]
    );

    return result.rows[0];
  }

  async updateGameState(gameId, state) {
    const result = await pool.query(
      `UPDATE games
       SET status = $2,
           result = $3,
           current_turn = $4,
           fen = $5,
           last_move_san = $6,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [gameId, state.status, state.result, state.currentTurn, state.fen, state.lastMoveSan]
    );

    return result.rows[0];
  }

  async createAgentRun(run) {
    const result = await pool.query(
      `INSERT INTO agent_runs (
         session_id, game_id, prompt_class, query, answer, model, retrieval_mode, citations
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      [
        run.sessionId,
        run.gameId,
        run.promptClass,
        run.query,
        run.answer,
        run.model,
        run.retrievalMode,
        JSON.stringify(run.citations)
      ]
    );

    return result.rows[0];
  }

  async addAuditEvent(event) {
    const result = await pool.query(
      `INSERT INTO audit_events (session_id, game_id, agent_run_id, event_type, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [
        event.sessionId ?? null,
        event.gameId ?? null,
        event.agentRunId ?? null,
        event.eventType,
        JSON.stringify(event.payload ?? {})
      ]
    );

    return result.rows[0];
  }

  async listAuditEvents(gameId, limit = 10) {
    const result = await pool.query(
      `SELECT * FROM audit_events
       WHERE game_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [gameId, limit]
    );

    return result.rows;
  }

  async upsertDocument({ slug, title, body, metadata }) {
    const result = await pool.query(
      `INSERT INTO agent_documents (slug, title, body, metadata)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (slug) DO UPDATE
         SET title = EXCLUDED.title,
             body = EXCLUDED.body,
             metadata = EXCLUDED.metadata,
             updated_at = NOW()
       RETURNING *`,
      [slug, title, body, JSON.stringify(metadata ?? {})]
    );

    return result.rows[0];
  }

  async replaceDocumentChunks(documentId, chunks) {
    await pool.query(`DELETE FROM agent_chunks WHERE document_id = $1`, [documentId]);

    for (const chunk of chunks) {
      await pool.query(
        `INSERT INTO agent_chunks (document_id, chunk_index, content, metadata, embedding)
         VALUES ($1, $2, $3, $4::jsonb, $5::vector)`,
        [
          documentId,
          chunk.chunkIndex,
          chunk.content,
          JSON.stringify(chunk.metadata ?? {}),
          chunk.embedding ? toVectorLiteral(chunk.embedding) : null
        ]
      );
    }
  }

  async searchChunksVectorless(queryText, limit = 5) {
    const result = await pool.query(
      `SELECT
         c.id,
         c.document_id,
         c.chunk_index,
         c.content,
         c.metadata,
         d.slug,
         d.title,
         ts_rank_cd(c.search_vector, plainto_tsquery('english', $1)) AS rank
       FROM agent_chunks c
       JOIN agent_documents d ON d.id = c.document_id
       WHERE d.approved = TRUE
         AND c.search_vector @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC, c.chunk_index ASC
       LIMIT $2`,
      [queryText, limit]
    );

    return result.rows.map((row) => ({ ...row, score: Number(row.rank) }));
  }

  async searchChunksVector(embedding, limit = 5) {
    const result = await pool.query(
      `SELECT
         c.id,
         c.document_id,
         c.chunk_index,
         c.content,
         c.metadata,
         d.slug,
         d.title,
         1 - (c.embedding <=> $1::vector) AS similarity
       FROM agent_chunks c
       JOIN agent_documents d ON d.id = c.document_id
       WHERE d.approved = TRUE
         AND c.embedding IS NOT NULL
       ORDER BY c.embedding <=> $1::vector ASC
       LIMIT $2`,
      [toVectorLiteral(embedding), limit]
    );

    return result.rows.map((row) => ({ ...row, score: Number(row.similarity) }));
  }
}
