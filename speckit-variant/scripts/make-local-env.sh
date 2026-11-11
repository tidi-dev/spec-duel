#!/usr/bin/env bash
# Writes a local .env with throwaway values. Never commit the result.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ] && [ "${1:-}" != "--force" ]; then
  echo ".env already exists; leaving it alone (pass --force to regenerate it)." >&2
  exit 0
fi

offset="${PORT_OFFSET:-0}"
project="${COMPOSE_PROJECT_NAME:-roombook}"
gateway_port=$((3100 + offset))
web_port=$((4200 + offset))

umask 077
cat > .env <<ENV
COMPOSE_PROJECT_NAME=${project}
PORT_OFFSET=${offset}
DB_HOST=localhost
DB_PORT=$((5432 + offset))
DB_USERNAME=roombook
DB_PASSWORD=$(openssl rand -hex 12)
DB_DATABASE=roombook
REDIS_HOST=localhost
REDIS_PORT=$((6379 + offset))
NATS_PORT=$((4222 + offset))
NATS_URL=nats://localhost:$((4222 + offset))
GATEWAY_PORT=${gateway_port}
WEB_PORT=${web_port}
WEB_ORIGIN=http://localhost:${web_port}
NEXT_PUBLIC_API_URL=http://localhost:${gateway_port}/api
ENV
echo "Wrote .env for project ${project} (port offset ${offset})." >&2
