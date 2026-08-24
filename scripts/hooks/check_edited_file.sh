#!/usr/bin/env bash
# Post-edit checker, wired up as a Claude Code PostToolUse hook.
#
# Reads the hook payload on stdin, pulls out the edited file path, and runs the cheapest
# check that is meaningful for that file type. Anything it cannot classify is a no-op.
#
# Why a hook and not an instruction: "always typecheck after editing" is exactly the kind of
# rule an agent can silently skip. The harness runs this unconditionally, so it holds.
#
# Exit codes: 0 = fine (or nothing to do), 2 = check failed and the agent should see stderr.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

payload="$(cat)"

# jq is preferred; fall back to python3 so this works on a bare machine.
if command -v jq >/dev/null 2>&1; then
  file_path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')"
else
  file_path="$(printf '%s' "$payload" | python3 -c \
    'import json,sys; print((json.load(sys.stdin).get("tool_input") or {}).get("file_path") or "")' 2>/dev/null)"
fi

[ -n "$file_path" ] || exit 0
[ -f "$file_path" ] || exit 0

case "$file_path" in
  # ── Web: TypeScript / TSX ────────────────────────────────────────────────
  "$REPO_ROOT"/web/*.ts | "$REPO_ROOT"/web/*.tsx)
    # Skip generated Next.js output — .next/dev/types can carry errors that have
    # nothing to do with the edit (a corrupt cache produces dozens of them).
    case "$file_path" in
      *"/web/.next/"*|*"/node_modules/"*) exit 0 ;;
    esac
    output="$(cd "$REPO_ROOT/web" && npx --no-install tsc --noEmit 2>&1)"
    status=$?
    if [ $status -ne 0 ]; then
      # Filter out generated-file noise so only real errors surface.
      real="$(printf '%s\n' "$output" | grep -v '^\.next/' || true)"
      if [ -n "$real" ]; then
        printf 'tsc --noEmit failed for web/:\n%s\n' "$real" >&2
        exit 2
      fi
    fi
    ;;

  # ── Python: services/ and cli/ ───────────────────────────────────────────
  "$REPO_ROOT"/services/*.py | "$REPO_ROOT"/cli/*.py)
    case "$file_path" in
      *"/__pycache__/"*|*"/.pixi/"*) exit 0 ;;
    esac
    # Import-only smoke check: catches the failure mode that has actually cost time here
    # (a missing import surfacing on a live Garmin sync). Full pytest is too slow per-edit.
    rel="${file_path#"$REPO_ROOT"/}"
    module="$(printf '%s' "${rel%.py}" | tr '/' '.')"
    module="${module%.__init__}"
    if ! output="$("$REPO_ROOT/.pixi/envs/default/bin/python" -c "import $module" 2>&1)"; then
      printf 'Import check failed for %s:\n%s\n' "$module" "$output" >&2
      exit 2
    fi
    ;;
esac

exit 0
