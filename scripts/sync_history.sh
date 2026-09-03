#!/usr/bin/env bash
# Nightly historical backfill — keeps daily_metrics.predicted_*_secs (race time
# predictions) dense over a rolling window. --sync-kpis only ever writes Garmin's
# live "current" race-prediction snapshot into whatever date Garmin stamps it with,
# which can go stale for days between qualifying runs, leaving gaps in the trend
# charts. --sync-history instead pulls Garmin's dense per-day prediction history
# endpoint and backfills every date in range, closing those gaps.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$PROJECT_DIR/my_training_config.yaml"
LOG="$HOME/.garmin-ai-coach-history-sync.log"

# Load .env if it exists (for SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

cd "$PROJECT_DIR"

/opt/homebrew/bin/pixi run python cli/garmin_ai_coach_cli.py \
  --sync-history "$CONFIG" \
  >> "$LOG" 2>&1
