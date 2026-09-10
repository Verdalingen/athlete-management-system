#!/usr/bin/env bash
# Daily KPI sync — safe to call on every login/wake.
# The CLI skips automatically if already run today.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$PROJECT_DIR/my_training_config.yaml"
LOG="$HOME/.ams-kpi-sync.log"

# Load .env if it exists (for SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

cd "$PROJECT_DIR"

/opt/homebrew/bin/pixi run python cli/ams.py \
  --sync-kpis "$CONFIG" \
  >> "$LOG" 2>&1
