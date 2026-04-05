# Saroir BYOA Chess POC

Standalone BYOA chess proof of concept for Saroir. The app demonstrates:

- deterministic chess play via minimax,
- retrieval-backed agent answers via Ollama,
- explicit audit logging for every agent run.

## Stack

- Node.js + Express
- `chess.js`
- Postgres + `pgvector`
- Ollama (`qwen2.5:7b-instruct` for chat, `nomic-embed-text` for embeddings)

## Quick Start

1. Copy `.env.example` to `.env`.
2. Start Postgres and Ollama:

```bash
docker compose up -d postgres ollama
```

3. Pull the Ollama models you want to use:

```bash
ollama pull qwen2.5:7b-instruct
ollama pull nomic-embed-text
```

4. Install dependencies and initialize the database:

```bash
npm install
npm run db:init
npm run seed:docs
```

5. Start the app:

```bash
npm run dev
```

The web UI is served from `http://localhost:3000/`.

## Docker Runtime Note

If the app itself runs inside Docker, do not use `http://localhost:11434` for `OLLAMA_BASE_URL`.
Use the Ollama service hostname on the Docker network instead:

```bash
OLLAMA_BASE_URL=http://ollama:11434
```

## API

Exactly five JSON API endpoints are exposed:

- `POST /api/sessions`
- `POST /api/games`
- `GET /api/games/:gameId`
- `POST /api/games/:gameId/moves`
- `POST /api/games/:gameId/agent/query`

## Notes

- Only the move endpoint mutates game state.
- Agent responses are logged in `agent_runs` and `audit_events`.
- If Ollama is unavailable, agent answers degrade safely instead of mutating state or failing the game flow.
- The live Saroir `/byoa` page is not in this repo. QC findings and recommendations are captured in [`docs/byoa-qc.md`](/home/anurag/dev/projects/saroir/docs/byoa-qc.md).
