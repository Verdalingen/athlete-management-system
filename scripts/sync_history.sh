#!/usr/bin/env bash
# Nightly historical backfill — pulls up to 365 days of Garmin trend data into
# daily_metrics. Heavier than sync_kpis.sh and not internally throttled, so it is
# driven by a once-a-night calendar trigger rather than a frequent interval.
#
# Exists because sync-kpis' "today" write isn't reliably dated today, which once
# left a 46-day hole in daily_metrics. This re-walks the window and fills gaps.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$PROJECT_DIR/my_training_config.yaml"
LOG="$HOME/.ams-history-sync.log"

# Load .env if it exists (for SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

cd "$PROJECT_DIR"

/opt/homebrew/bin/pixi run python cli/ams.py \
  --sync-history "$CONFIG" \
  >> "$LOG" 2>&1
