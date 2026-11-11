#!/usr/bin/env bash
# One entry point for the demo: start, stop, check and test both kit variants, and run the console.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
STATE="$ROOT/.demo"
CONSOLE_PORT=4300

usage() {
  cat <<'EOF'
Usage: ./demo.sh <command> [target...]

Targets: openspec, speckit, baseline. Default: openspec speckit.

Commands:
  up [targets]       Start the stacks (infra, migrations, build, all apps) and the console.
  down [targets]     Stop the stacks and the console. Data is kept.
  reset [targets]    Wipe each target's data and start it again.
  status             Show what is running and on which ports.
  test [targets]     Run the hidden acceptance suite against each running target.
  console            Run only the console, in the foreground (no stacks needed).
  help               Show this text.
EOF
}

dir_of() { if [ "$1" = baseline ]; then echo "$ROOT/baseline"; else echo "$ROOT/$1-variant"; fi; }
gateway_port() { case "$1" in baseline) echo 3100 ;; openspec) echo 3110 ;; speckit) echo 3120 ;; esac; }
web_port() { case "$1" in baseline) echo 4200 ;; openspec) echo 4210 ;; speckit) echo 4220 ;; esac; }
label() { case "$1" in baseline) echo "Baseline (before either kit)" ;; openspec) echo "OpenSpec variant" ;; speckit) echo "Spec Kit variant" ;; esac; }

is_up() { curl -fs -o /dev/null --max-time 2 "http://localhost:$(gateway_port "$1")/api/health/gateway"; }
console_up() { curl -fs -o /dev/null --max-time 2 "http://127.0.0.1:${CONSOLE_PORT}/api/scenes"; }

targets_from() {
  if [ $# -eq 0 ]; then
    echo "openspec speckit"
    return
  fi
  for target in "$@"; do
    case "$target" in
      openspec | speckit | baseline) ;;
      *) echo "Unknown target: $target (use openspec, speckit or baseline)" >&2; exit 2 ;;
    esac
  done
  echo "$@"
}

check_prerequisites() {
  local missing=0
  for tool in node pnpm docker curl; do
    command -v "$tool" >/dev/null 2>&1 || { echo "Missing: $tool" >&2; missing=1; }
  done
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running. Start Docker Desktop and try again." >&2
    missing=1
  fi
  [ "$missing" -eq 0 ] || exit 1
}

kill_port() {
  local pids
  pids="$(lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "$pids" ] && kill $pids 2>/dev/null
  return 0
}

start_console() {
  if console_up; then
    echo "Console already running."
    return
  fi
  mkdir -p "$STATE/logs"
  node "$ROOT/console/server.mjs" --port "$CONSOLE_PORT" > "$STATE/logs/console.log" 2>&1 &
  echo $! > "$STATE/console.pid"
  for _ in $(seq 1 20); do
    console_up && return
    sleep 0.5
  done
  echo "Console did not start; see $STATE/logs/console.log" >&2
}

stop_console() {
  if [ -f "$STATE/console.pid" ]; then
    kill "$(cat "$STATE/console.pid")" 2>/dev/null || true
    rm -f "$STATE/console.pid"
  fi
  kill_port "$CONSOLE_PORT"
}

print_urls() {
  echo
  printf '%-30s %-38s %s\n' "" "Front end" "API"
  for target in $1; do
    if is_up "$target"; then
      printf '%-30s %-38s %s\n' "$(label "$target")" "http://localhost:$(web_port "$target")/bookings" "http://localhost:$(gateway_port "$target")/api"
    else
      printf '%-30s %s\n' "$(label "$target")" "not running"
    fi
  done
  if console_up; then
    printf '%-30s %s\n' "Console (recorded runs)" "http://127.0.0.1:${CONSOLE_PORT}"
  fi
  echo
}

cmd_up() {
  check_prerequisites
  local targets
  targets="$(targets_from "$@")"
  mkdir -p "$STATE/logs"
  local started=""
  for target in $targets; do
    local dir
    dir="$(dir_of "$target")"
    if is_up "$target"; then
      echo "$(label "$target"): already running."
      continue
    fi
    if [ ! -d "$dir/node_modules" ]; then
      echo "$(label "$target"): installing dependencies (first run only)..."
      (cd "$dir" && pnpm install --frozen-lockfile >"$STATE/logs/$target-install.log" 2>&1) || {
        echo "$(label "$target"): install failed; see $STATE/logs/$target-install.log" >&2
        continue
      }
    fi
    echo "$(label "$target"): starting (build and start take a few minutes)..."
    (cd "$dir" && scripts/stack-up.sh) >"$STATE/logs/$target-up.log" 2>&1 &
    echo $! > "$STATE/$target-up.pid"
    started="$started $target"
  done
  local failed=0
  for target in $started; do
    if wait "$(cat "$STATE/$target-up.pid")"; then
      echo "$(label "$target"): up."
    else
      echo "$(label "$target"): failed to start; see $STATE/logs/$target-up.log" >&2
      failed=1
    fi
    rm -f "$STATE/$target-up.pid"
  done
  start_console
  print_urls "$targets"
  return "$failed"
}

cmd_down() {
  local targets
  if [ $# -eq 0 ]; then targets="openspec speckit baseline"; else targets="$(targets_from "$@")"; fi
  for target in $targets; do
    local dir
    dir="$(dir_of "$target")"
    [ -f "$dir/.env" ] || continue
    (cd "$dir" && scripts/stack-down.sh >/dev/null 2>&1)
    kill_port "$(web_port "$target")"
    kill_port "$(gateway_port "$target")"
    echo "$(label "$target"): stopped."
  done
  if [ $# -eq 0 ]; then
    stop_console
    echo "Console: stopped."
  fi
}

cmd_reset() {
  check_prerequisites
  local targets
  targets="$(targets_from "$@")"
  cmd_down $targets
  for target in $targets; do
    (cd "$(dir_of "$target")" && docker compose down --volumes >/dev/null 2>&1)
    echo "$(label "$target"): data wiped."
  done
  cmd_up $targets
}

cmd_status() {
  for target in openspec speckit baseline; do
    local containers
    containers="$(cd "$(dir_of "$target")" && docker compose ps -q 2>/dev/null | wc -l | tr -d ' ')"
    if is_up "$target"; then
      echo "$(label "$target"): running (front end :$(web_port "$target"), API :$(gateway_port "$target"), $containers containers)"
    else
      echo "$(label "$target"): not running ($containers containers)"
    fi
  done
  if console_up; then echo "Console: running (:${CONSOLE_PORT})"; else echo "Console: not running"; fi
}

cmd_test() {
  local targets failed=0
  targets="$(targets_from "$@")"
  [ -d "$ROOT/acceptance/node_modules" ] || (cd "$ROOT/acceptance" && pnpm install --frozen-lockfile >/dev/null)
  for target in $targets; do
    if ! is_up "$target"; then
      echo "$(label "$target"): not running; start it with ./demo.sh up $target" >&2
      failed=1
      continue
    fi
    echo "== $(label "$target")"
    (cd "$ROOT/acceptance" && GATEWAY_URL="http://localhost:$(gateway_port "$target")/api" npx jest 2>&1 | grep -E "^(PASS|FAIL)|✕|Tests:") || failed=1
  done
  return "$failed"
}

case "${1:-help}" in
  up) shift; cmd_up "$@" ;;
  down) shift; cmd_down "$@" ;;
  reset) shift; cmd_reset "$@" ;;
  status) cmd_status ;;
  test) shift; cmd_test "$@" ;;
  console) exec node "$ROOT/console/server.mjs" --port "$CONSOLE_PORT" ;;
  help | -h | --help) usage ;;
  *) usage; exit 2 ;;
esac
