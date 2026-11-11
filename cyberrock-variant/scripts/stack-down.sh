#!/usr/bin/env bash
# Stops the apps started by stack-up.sh and the compose services. Pass --volumes to drop the data.
set -uo pipefail
cd "$(dirname "$0")/.."

if [ -d tmp/pids ]; then
  for pid_file in tmp/pids/*.pid; do
    [ -e "$pid_file" ] || continue
    pid="$(cat "$pid_file")"
    kill "$pid" 2>/dev/null || true
    rm -f "$pid_file"
  done
fi

if [ -f .env ]; then
  if [ "${1:-}" = "--volumes" ]; then
    docker compose down --volumes
  else
    docker compose down
  fi
fi
