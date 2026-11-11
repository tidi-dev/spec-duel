#!/usr/bin/env bash
# Starts infra, runs migrations, builds and starts every app. Exits 0 once the gateway answers.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || scripts/make-local-env.sh
set -a
# shellcheck disable=SC1091
. ./.env
set +a

mkdir -p tmp/logs tmp/pids

docker compose up -d --wait
pnpm run migration:run
pnpm run build

export NODE_ENV=production

start_app() {
  local name="$1"
  shift
  "$@" > "tmp/logs/${name}.log" 2>&1 &
  echo $! > "tmp/pids/${name}.pid"
}

for app in room booking worker gateway; do
  start_app "$app" node "dist/apps/${app}/main.js"
done
start_app web pnpm nx serve web --prod --port "${WEB_PORT}"

health_url="http://localhost:${GATEWAY_PORT}/api/health/gateway"
for _ in $(seq 1 60); do
  if curl -fs -o /dev/null "$health_url"; then
    echo "Stack is up: gateway on ${GATEWAY_PORT}, web on ${WEB_PORT}." >&2
    exit 0
  fi
  sleep 1
done

echo "Gateway did not answer at ${health_url}; see tmp/logs/." >&2
exit 1
