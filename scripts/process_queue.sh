#!/usr/bin/env bash
# Process pending check-in/replan jobs queued via the web UI.
# Runs frequently (see the LaunchAgent's StartInterval) — cheap no-op when the queue is empty.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$PROJECT_DIR/my_training_config.yaml"
LOG="$HOME/.garmin-ai-coach-process-queue.log"

# Load .env if it exists (for SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID, etc.)
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

cd "$PROJECT_DIR"

# Cheap no-op when the queue is empty: one REST round-trip instead of paying the
# pixi + Python (langgraph import tree) startup cost every 90s. If the check
# itself fails, treat the queue as empty and let the next interval retry.
if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  pending=$(curl -sf --max-time 10 \
    "$SUPABASE_URL/rest/v1/replan_jobs?status=eq.pending&select=id&limit=1" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" || echo '[]')
  if [ "$pending" = "[]" ]; then
    exit 0
  fi
fi

/opt/homebrew/bin/pixi run python cli/garmin_ai_coach_cli.py \
  --queue "$CONFIG" \
  >> "$LOG" 2>&1
