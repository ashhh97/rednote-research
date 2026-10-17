#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$(cd "${SKILL_DIR}/../.." && pwd)"

cd "${PROJECT_DIR}"
exec npm run search -- "$@"
