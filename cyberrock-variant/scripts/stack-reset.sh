#!/usr/bin/env bash
# Drops the local data and starts a fresh stack.
set -euo pipefail
cd "$(dirname "$0")/.."

scripts/stack-down.sh --volumes
scripts/stack-up.sh
