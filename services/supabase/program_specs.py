"""Read/write program_specs — the versioned, per-athlete ProgramSpec.

Thin I/O only, matching plan_writer.py/athlete_profile.py's existing split:
pure logic (services/scheduling/live_state.py, program_spec.py, solver.py)
stays testable without Supabase; this module is just the Supabase boundary.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any

from services.scheduling.program_spec import ProgramSpec

from .client import get_supabase, rows

logger = logging.getLogger(__name__)


def get_active_program_spec(user_id: str) -> ProgramSpec | None:
    """Return the athlete's active ProgramSpec, or None if there isn't one.

    Re-validates the stored JSON against ProgramSpec even though it was
    validated at write time — defensive: a corrupted or hand-edited row
    should fail loudly here, not silently misbehave downstream in the solver.
    """
    sb = get_supabase()
    found = rows(
        sb.table("program_specs")
        .select("spec")
        .eq("user_id", user_id)
        .eq("status", "active")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not found:
        return None
    return ProgramSpec(**found[0]["spec"])


def write_active_program_spec(
    *,
    user_id: str,
    spec: ProgramSpec,
    rationale: str,
    effective_from: date,
    source: str,
) -> str:
    """Atomically supersede the current active spec (if any) and insert this one.

    Via the activate_program_spec() RPC (migration 044) — a plain update-then-
    insert has a real gap where a crash between the two steps leaves the
    athlete with zero active specs. Returns the new row's id.
    """
    sb = get_supabase()
    result = sb.rpc(
        "activate_program_spec",
        {
            "p_user_id": user_id,
            "p_spec": spec.model_dump(mode="json"),
            "p_rationale": rationale,
            "p_effective_from": effective_from.isoformat(),
            "p_source": source,
        },
    ).execute()
    new_id = str(result.data)
    logger.info("Activated program_specs row %s (source=%s)", new_id, source)
    return new_id


def fetch_checkin_context(
    user_id: str, window_dates: list[date]
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, dict[date, dict[str, Any]]]:
    """Fetch what a check-in needs from scheduled_days/strength_sessions.

    Returns (today's scheduled_days row, today's strength_sessions row,
    {date: row} for the whole window) — strength rows enriched with 'slot' so
    live_state.py's resolvers can match them to a session_type_key.

    Returns raw dict rows, not domain objects — feed them into
    services/scheduling/live_state.py's pure functions.
    """
    sb = get_supabase()
    today = date.today()
    today_str = today.isoformat()
    start_str = min(window_dates).isoformat()
    end_str = max(window_dates).isoformat()

    scheduled_rows = rows(
        sb.table("scheduled_days")
        .select("date, session_type, is_key")
        .eq("user_id", user_id)
        .gte("date", start_str)
        .lte("date", end_str)
        .execute()
    )

    strength_rows = rows(
        sb.table("strength_sessions")
        .select("date, slot")
        .eq("user_id", user_id)
        .gte("date", start_str)
        .lte("date", end_str)
        .execute()
    )
    slot_by_date = {r["date"]: r.get("slot") for r in strength_rows}

    existing: dict[date, dict[str, Any]] = {}
    today_row: dict[str, Any] | None = None
    for r in scheduled_rows:
        enriched = dict(r)
        if r.get("session_type") == "strength" and r["date"] in slot_by_date:
            enriched["slot"] = slot_by_date[r["date"]]
        existing[date.fromisoformat(r["date"])] = enriched
        if r["date"] == today_str:
            today_row = enriched

    today_strength_row = {"slot": slot_by_date[today_str]} if today_str in slot_by_date else None
    return today_row, today_strength_row, existing
