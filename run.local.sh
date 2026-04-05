#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

log() {
  printf '[run.sh] %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_command docker
require_command curl

if [ ! -f .env ]; then
  cp .env.example .env
  log "Created .env from .env.example"
fi

set -a
# shellcheck disable=SC1091
source ./.env
set +a

PORT="${PORT:-3000}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
OLLAMA_CHAT_MODEL="${OLLAMA_CHAT_MODEL:-qwen2.5:3b}"
OLLAMA_EMBED_MODEL="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"
APP_DATABASE_URL="postgres://postgres:postgres@postgres:5432/chessmoves_byoa"
APP_OLLAMA_BASE_URL="http://ollama:11434"

log "Starting postgres and ollama containers"
docker compose up -d postgres ollama

log "Waiting for Postgres"
until docker exec chessmoves-postgres-1 pg_isready -U postgres >/dev/null 2>&1; do
  sleep 2
done

log "Ensuring Postgres password matches app defaults"
docker exec -u postgres chessmoves-postgres-1 psql -d postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';" >/dev/null

log "Waiting for Ollama"
until curl -fsS "$OLLAMA_BASE_URL/api/tags" >/dev/null 2>&1; do
  sleep 2
done

log "Preparing Ollama models. First run may take several minutes while models download."
log "Pulling Ollama chat model: $OLLAMA_CHAT_MODEL"
docker compose exec -T ollama ollama pull "$OLLAMA_CHAT_MODEL"

log "Pulling Ollama embedding model: $OLLAMA_EMBED_MODEL"
docker compose exec -T ollama ollama pull "$OLLAMA_EMBED_MODEL"
log "Ollama models are ready. Later runs should be much faster."

log "Initializing database schema"
docker exec -i chessmoves-postgres-1 psql -U postgres -d chessmoves_byoa -f /dev/stdin < db/schema.sql >/dev/null

log "Stopping any previous app container"
docker rm -f chessmoves-app >/dev/null 2>&1 || true

log "Starting app container on http://127.0.0.1:$PORT"
exec docker run --rm --name chessmoves-app \
  --network chessmoves_default \
  -p "$PORT:3000" \
  --env-file .env \
  -e PORT=3000 \
  -e DATABASE_URL="$APP_DATABASE_URL" \
  -e OLLAMA_BASE_URL="$APP_OLLAMA_BASE_URL" \
  -v "$ROOT_DIR:/app" \
  -w /app \
  node:22 \
  bash -lc "npm install && npm run seed:docs && npm start"
