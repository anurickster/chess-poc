# BYOA Chess POC

Standalone BYOA chess proof of concept. The app demonstrates:

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

## One-Command Startup

Use the single startup script:

```bash
bash ./run.sh
```

What it does:

- creates `.env` from `.env.example` if needed,
- starts or reuses Docker containers for Postgres and Ollama,
- creates the configured database if it is missing,
- applies the schema without requiring host `psql`,
- pulls missing Ollama models,
- starts the app in a Dockerized Node runtime.

Windows note:

- run the script from Git Bash or WSL,
- Docker Desktop must be running.

Setup-only mode:

```bash
SETUP_ONLY=1 bash ./run.sh
```

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
- Platform-specific `/byoa` page assets are not in this repo. QC findings and recommendations are captured in `docs/byoa-qc.md`.
