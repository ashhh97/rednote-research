#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${TRAVEL_AGENT_ROOT:-$(cd "$SCRIPT_ROOT/../../.." && pwd)}"
cd "$ROOT_DIR"

export XHS_AUTH_DIR="${XHS_AUTH_DIR:-xhs-auth-test}"
export XHS_WEB_ORIGIN="${XHS_WEB_ORIGIN:-https://www.rednote.com}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-.playwright-browsers}"
export TRAVEL_RESEARCH_BRIDGE_URL="${TRAVEL_RESEARCH_BRIDGE_URL:-http://127.0.0.1:8787}"

exec node projects/travel-discovery/scripts/request-bridge.js "$@"
