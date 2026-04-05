#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PROJECT_NAME="${PROJECT_NAME:-chessmoves}"
APP_CONTAINER="${PROJECT_NAME}-app"
NODE_IMAGE="${NODE_IMAGE:-node:22}"
NODE_MODULES_VOLUME="${PROJECT_NAME}_node_modules"
NPM_CACHE_VOLUME="${PROJECT_NAME}_npm_cache"
SETUP_ONLY="${SETUP_ONLY:-0}"

log() {
  printf '[run.sh] %s\n' "$1"
}

die() {
  printf '[run.sh] %s\n' "$1" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "Missing required command: $1"
  fi
}

pick_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_BIN=(docker compose)
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_BIN=(docker-compose)
    return
  fi

  die "Docker Compose is required. Install Docker Desktop or docker-compose."
}

compose() {
  "${COMPOSE_BIN[@]}" -p "$PROJECT_NAME" -f "$ROOT_DIR/docker-compose.yml" "$@"
}

ensure_env_file() {
  if [ ! -f .env ]; then
    cp .env.example .env
    log "Created .env from .env.example"
  fi
}

docker_mount_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -am "$ROOT_DIR"
    return
  fi

  if pwd -W >/dev/null 2>&1; then
    (
      cd "$ROOT_DIR"
      pwd -W
    )
    return
  fi

  printf '%s' "$ROOT_DIR"
}

port_in_use() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :$port )" 2>/dev/null | grep -q ":$port"
    return
  fi

  if command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | grep -E "[\.:]$port[[:space:]].*LISTEN" >/dev/null 2>&1
    return
  fi

  return 1
}

ensure_app_port_available() {
  local port="$1"

  docker rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true

  if port_in_use "$port"; then
    die "Port $port is already in use. Free it or change PORT in .env before starting the app."
  fi
}

wait_for_postgres() {
  log "Waiting for Postgres"
  until compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
    sleep 2
  done
}

wait_for_ollama() {
  log "Waiting for Ollama"
  until compose exec -T ollama ollama list >/dev/null 2>&1; do
    sleep 2
  done
}

ensure_database_exists() {
  local database_name="$1"
  local exists

  exists="$(compose exec -T postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$database_name';" | tr -d '[:space:]')"
  if [ "$exists" = "1" ]; then
    log "Database $database_name already exists"
    return
  fi

  log "Creating database $database_name"
  compose exec -T postgres psql -U postgres -d postgres -c "CREATE DATABASE \"$database_name\";" >/dev/null
}

apply_schema() {
  local database_name="$1"

  log "Applying database schema"
  cat "$ROOT_DIR/db/schema.sql" | compose exec -T postgres psql -U postgres -d "$database_name" >/dev/null
}

ensure_ollama_model() {
  local model_name="$1"
  local listed_models

  listed_models="$(compose exec -T ollama ollama list | awk 'NR > 1 { print $1 }')"

  if printf '%s\n' "$listed_models" | grep -Fxq "$model_name"; then
    log "Ollama model already available: $model_name"
    return
  fi

  if [[ "$model_name" != *:* ]] && printf '%s\n' "$listed_models" | grep -Fxq "${model_name}:latest"; then
    log "Ollama model already available: $model_name"
    return
  fi

  log "Pulling Ollama model: $model_name"
  compose exec -T ollama ollama pull "$model_name"
}

start_dependencies() {
  log "Starting postgres and ollama containers"
  compose up -d postgres ollama
}

validate_runtime_values() {
  if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
    die "PORT must be numeric. Current value: $PORT"
  fi

  if ! [[ "$DATABASE_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
    die "Database name must contain only letters, numbers, or underscores. Current value: $DATABASE_NAME"
  fi
}

run_app_container() {
  local mount_path="$1"
  local internal_database_url="$2"

  docker volume create "$NODE_MODULES_VOLUME" >/dev/null
  docker volume create "$NPM_CACHE_VOLUME" >/dev/null

  log "Starting app container on http://127.0.0.1:$PORT"

  exec env MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' docker run --rm \
    --name "$APP_CONTAINER" \
    --network "${PROJECT_NAME}_default" \
    -p "$PORT:3000" \
    --env-file .env \
    -e PORT=3000 \
    -e DATABASE_URL="$internal_database_url" \
    -e OLLAMA_BASE_URL="http://ollama:11434" \
    -v "$mount_path:/app" \
    -v "$NODE_MODULES_VOLUME:/app/node_modules" \
    -v "$NPM_CACHE_VOLUME:/root/.npm" \
    -w /app \
    "$NODE_IMAGE" \
    bash -lc '
      set -euo pipefail

      if [ -f package-lock.json ]; then
        current_hash="$(sha256sum package-lock.json | awk "{print \$1}")"
      else
        current_hash="$(sha256sum package.json | awk "{print \$1}")"
      fi

      installed_hash="$(cat node_modules/.chessmoves-lock-hash 2>/dev/null || true)"

      if [ "$current_hash" != "$installed_hash" ]; then
        rm -rf node_modules/*
        if [ -f package-lock.json ]; then
          npm ci
        else
          npm install
        fi
        printf "%s" "$current_hash" > node_modules/.chessmoves-lock-hash
      fi

      npm run seed:docs
      npm start
    '
}

require_command docker
pick_compose

if ! docker info >/dev/null 2>&1; then
  die "Docker is installed but the daemon is not running. Start Docker Desktop or the Docker service first."
fi

ensure_env_file

set -a
# shellcheck disable=SC1091
source ./.env
set +a

PORT="${PORT:-3000}"
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:55432/chessmoves_byoa}"
OLLAMA_CHAT_MODEL="${OLLAMA_CHAT_MODEL:-qwen2.5:3b}"
OLLAMA_EMBED_MODEL="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"
DATABASE_NAME="${DATABASE_URL##*/}"
DATABASE_NAME="${DATABASE_NAME%%\?*}"

validate_runtime_values
start_dependencies
wait_for_postgres
wait_for_ollama
ensure_database_exists "$DATABASE_NAME"
apply_schema "$DATABASE_NAME"
ensure_ollama_model "$OLLAMA_CHAT_MODEL"
ensure_ollama_model "$OLLAMA_EMBED_MODEL"

if [ "$SETUP_ONLY" = "1" ]; then
  log "Setup completed. Dependencies are ready."
  exit 0
fi

ensure_app_port_available "$PORT"
run_app_container "$(docker_mount_path)" "postgres://postgres:postgres@postgres:5432/$DATABASE_NAME"
