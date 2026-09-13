"""Detect how the athlete's real training has drifted from the plan.

Placement decisions belong to the coach, but the *facts* behind them shouldn't — "did every
session happen, just later?" is mechanically checkable, and the codebase's standing lesson is
to compute those deterministically rather than ask the LLM to eyeball them (same reasoning as
the strength rotation and the legs-before-hard-runs spacing check).

So: this module computes what happened and what the options cost. The planner decides what to
do about it. The one case it resolves outright is a *pure shift* — every planned session
completed, all at the same offset, nothing missed or added — because there's no judgment left
to make there, and resolving it deterministically means a plain "I did everything a day late"
costs nothing and can't be mis-authored.
"""
from __future__ import annotations

import logging
from collections import Counter
from datetime import date, timedelta
from typing import Any

from .client import get_supabase, rows

logger = logging.getLogger(__name__)

# Garmin activity_type -> the plan's session_type vocabulary. Anything unmapped is "other" and
# never counts as satisfying a planned strength/run session.
_ACTIVITY_KIND = {
    "strength_training": "strength",
    "running": "run",
    "treadmill_running": "run",
    "trail_running": "run",
    "track_running": "run",
    "indoor_running": "run",
    "cycling": "cross",
    "indoor_cycling": "cross",
    "swimming": "cross",
    "lap_swimming": "cross",
    # Real aerobic load that is NOT a run stimulus. Hiking is this athlete's 3rd most common
    # activity (5 sessions, ~87min, ~38 load) — mapping it to "other" made substituted
    # sessions vanish from the analysis entirely, so a hike instead of intervals looked
    # identical to doing nothing.
    "hiking": "cross",
    "walking": "cross",
    "indoor_cardio": "cross",
    "rowing": "cross",
    "indoor_rowing": "cross",
    "elliptical": "cross",
    "ski_touring": "cross",
    "backcountry_skiing": "cross",
    "cross_country_skiing": "cross",
}

# A logged session shorter than this doesn't count as having completed a planned session —
# matches the floor used for bench-session counting in plan_writer.
_MIN_REAL_SESSION_SECS = 900


def activity_kind(activity_type: str | None) -> str:
    return _ACTIVITY_KIND.get((activity_type or "").lower(), "other")


def detect_pure_shift(
    planned: list[dict],
    completed_by_date: dict[str, Counter[str]],
    max_shift: int = 7,
) -> int | None:
    """Return N if every planned session was completed exactly N days late, else None.

    ``planned`` is [{date, session_type}] for non-rest days only, ``completed_by_date`` maps an
    ISO date to a Counter of how many of each session kind were completed that day (a real
    count, not just presence — two same-day runs are two, not one, since a date can hold more
    than one planned session, see migration 045). Returns None for offset 0 (nothing drifted),
    for any partial match (some on time, some late — that's a judgment call, not a shift), and
    when anything was missed outright.
    """
    if not planned:
        return None

    def matches_at(offset: int) -> bool:
        # Consume-and-check against a scratch copy: N planned-of-kind on a date requires N
        # completed-of-kind at the shifted target, not just "at least one" — two same-day
        # same-type sessions must both be accounted for, not collapsed into one match.
        remaining = {d: Counter(c) for d, c in completed_by_date.items()}
        for p in planned:
            target = (date.fromisoformat(p["date"]) + timedelta(days=offset)).isoformat()
            bucket = remaining.get(target)
            if not bucket or bucket[p["session_type"]] <= 0:
                return False
            bucket[p["session_type"]] -= 1
        return True

    if matches_at(0):
        return None  # on plan; nothing to shift
    for offset in range(1, max_shift + 1):
        if matches_at(offset):
            return offset
    return None


def analyze_plan_drift(
    lookback_days: int = 14,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Compare what was planned against what was actually done, over the recent window.

    Returns:
      pure_shift_days — int when the whole window slid by a uniform offset, else None
      missed          — planned sessions with no matching completion
      unplanned       — real sessions with no planned counterpart that day
      summary         — prose for the planner prompt (empty when nothing drifted)
    """
    sb = get_supabase()
    uid = user_id or _user_id()
    today = date.today()
    start = (today - timedelta(days=lookback_days)).isoformat()
    # Completions are read a week past today so a late session still matches its planned day.
    end = (today + timedelta(days=7)).isoformat()

    planned_rows = rows(
        sb.table("scheduled_days").select("date, session_type, focus, is_rest, is_key")
        .eq("user_id", uid).gte("date", start).lt("date", today.isoformat())
        .order("date").execute()
    )
    planned = [
        {"date": r["date"], "session_type": r["session_type"], "focus": r.get("focus"), "is_key": r.get("is_key")}
        for r in planned_rows
        if not r.get("is_rest") and r.get("session_type") not in (None, "rest")
    ]

    activity_rows = rows(
        sb.table("completed_activities").select("date, activity_type, duration_secs, activity_training_load")
        .eq("user_id", uid).gte("date", start).lte("date", end).execute()
    )
    completed_by_date: dict[str, Counter[str]] = {}
    activities_by_date: dict[str, list[dict]] = {}
    for r in activity_rows:
        if (r.get("duration_secs") or 0) < _MIN_REAL_SESSION_SECS and r.get("duration_secs") is not None:
            continue
        completed_by_date.setdefault(r["date"], Counter())[activity_kind(r.get("activity_type"))] += 1
        activities_by_date.setdefault(r["date"], []).append(r)

    shift = detect_pure_shift(planned, completed_by_date)

    # Volume by type is the honest measure of "did the training happen", not per-date matching.
    # An athlete who swaps Tuesday's run with Wednesday's lift has missed nothing — per-date
    # matching would score that as two misses and push the coach to re-add work already done.
    # Counting distinct days per type (not raw activities) keeps a double-logged session from
    # inflating the total.
    window_dates = {p["date"] for p in planned}
    first, last = (min(window_dates), max(window_dates)) if window_dates else (start, start)

    planned_counts: dict[str, int] = {}
    for p in planned:
        planned_counts[p["session_type"]] = planned_counts.get(p["session_type"], 0) + 1

    done_counts: dict[str, int] = {}
    for d, kinds in completed_by_date.items():
        if first <= d <= last:
            for kind, n in kinds.items():
                if kind == "other":
                    continue
                done_counts[kind] = done_counts.get(kind, 0) + n

    per_type = sorted(set(planned_counts) | set(done_counts))
    shortfall = {k: planned_counts.get(k, 0) - done_counts.get(k, 0) for k in per_type}
    # Same volume, different placement — the pattern held, the calendar didn't.
    reordered = bool(planned) and all(v <= 0 for v in shortfall.values()) and not shift

    # Retained for detail, but explicitly NOT the headline — see the note above. Occurrence-aware
    # (consume-and-check against a scratch copy), same reasoning as detect_pure_shift's
    # matches_at: two same-day same-type planned sessions must each be matched against a real
    # completion, not both waved through by one completion's mere presence.
    _remaining_at_0 = {d: Counter(c) for d, c in completed_by_date.items()}
    off_plan_days = []
    for p in planned:
        bucket = _remaining_at_0.get(p["date"])
        if bucket and bucket[p["session_type"]] > 0:
            bucket[p["session_type"]] -= 1
        else:
            off_plan_days.append(p)

    # SUBSTITUTIONS — the planned stimulus wasn't delivered, but real training happened that
    # day (a hike instead of intervals, say). This must be surfaced separately from a miss:
    # the athlete didn't get the intended quality, but they DID accumulate fatigue, so the
    # coach must not reschedule the missed session as if they'd come off a rest day.
    substitutions = []
    for p in off_plan_days:
        alternatives = [
            a for a in activities_by_date.get(p["date"], [])
            if activity_kind(a.get("activity_type")) != p["session_type"]
        ]
        if alternatives:
            substitutions.append({
                "date": p["date"],
                "planned": p["focus"] or p["session_type"],
                "did_instead": [
                    {
                        "type": a.get("activity_type"),
                        "minutes": round((a.get("duration_secs") or 0) / 60),
                        "training_load": a.get("activity_training_load"),
                    }
                    for a in alternatives
                ],
            })

    counts_line = ", ".join(
        f"{k}: {planned_counts.get(k, 0)} planned / {done_counts.get(k, 0)} done"
        for k in per_type
    )
    if shift:
        summary = (
            f"PLAN DRIFT — UNIFORM SHIFT: every planned session between {first} and {last} was "
            f"completed exactly {shift} day(s) later than scheduled. Right sessions, right order, "
            "just offset. No training was missed."
        )
    elif reordered:
        summary = (
            f"PLAN DRIFT — REORDERED, NOT MISSED: between {first} and {last} the athlete completed "
            f"at least the planned volume of each session type ({counts_line}), but on different "
            "days than scheduled. Treat this as placement drift, not missed training — do not "
            "re-add sessions that were already done under a different date."
        )
    elif any(v > 0 for v in shortfall.values()):
        short = ", ".join(f"{v} fewer {k}" for k, v in shortfall.items() if v > 0)
        summary = (
            f"PLAN DRIFT — SHORTFALL: between {first} and {last} the athlete completed {short} "
            f"session(s) than planned ({counts_line}). Some of the remainder may also have moved "
            "between days, so check volume before assuming a specific session was skipped."
        )
    else:
        summary = ""

    if substitutions:
        subs = "; ".join(
            f"{s0['date']}: planned {s0['planned']}, did "
            + " + ".join(
                f"{a['type']} {a['minutes']}min"
                + (f" (load {a['training_load']})" if a["training_load"] is not None else "")
                for a in s0["did_instead"]
            )
            for s0 in substitutions[:5]
        )
        summary = (summary + " " if summary else "") + (
            f"SUBSTITUTED SESSIONS — {subs}. The planned stimulus was not delivered, but real "
            "training load WAS accumulated on those days. Do not treat these as rest, and do not "
            "simply re-add the original session without accounting for the fatigue already taken on."
        )

    return {
        "pure_shift_days": shift,
        "substitutions": substitutions,
        "reordered": reordered,
        "planned_counts": planned_counts,
        "completed_counts": done_counts,
        "shortfall": {k: v for k, v in shortfall.items() if v > 0},
        "off_plan_days": off_plan_days,
        "summary": summary,
    }


def _user_id() -> str:
    import os
    uid = os.environ.get("SUPABASE_USER_ID", "")
    if not uid:
        raise RuntimeError("SUPABASE_USER_ID must be set")
    return uid
