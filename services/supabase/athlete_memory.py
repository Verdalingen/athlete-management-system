"""Read and write athlete memory entries from Supabase."""
from __future__ import annotations

import logging

from .client import get_supabase

logger = logging.getLogger(__name__)


def get_athlete_memory(user_id: str) -> str | None:
    """Return all memory for the given user as a formatted markdown string, or None if empty."""
    try:
        sb = get_supabase()
        result = sb.rpc("get_athlete_memory", {"p_user_id": user_id}).execute()
        text = result.data or ""
        return text.strip() or None
    except Exception as exc:
        logger.warning("Failed to load athlete memory for %s: %s", user_id, exc)
        return None


def upsert_memory_entry(
    user_id: str,
    category: str,
    key: str,
    value: str,
    confidence: int = 80,
    source: str = "coach_inferred",
) -> None:
    """Upsert a single memory entry."""
    try:
        sb = get_supabase()
        sb.rpc("upsert_athlete_memory", {
            "p_user_id": user_id,
            "p_category": category,
            "p_key": key,
            "p_value": value,
            "p_confidence": confidence,
            "p_source": source,
        }).execute()
    except Exception as exc:
        logger.warning("Failed to upsert athlete memory (%s/%s) for %s: %s", category, key, user_id, exc)
