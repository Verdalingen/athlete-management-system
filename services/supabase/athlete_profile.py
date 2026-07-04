"""Read structured athlete_profile fields from Supabase."""
from __future__ import annotations

import logging

from .client import get_supabase

logger = logging.getLogger(__name__)


def get_meal_variety_preference(user_id: str) -> str:
    """Return the athlete's meal variety preference ('minimal'/'balanced'/'high'), defaulting to 'balanced'."""
    try:
        sb = get_supabase()
        result = (
            sb.table("athlete_profile")
            .select("meal_variety_preference")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        value = (result.data or {}).get("meal_variety_preference")
        return value or "balanced"
    except Exception as exc:
        logger.warning("Failed to load meal variety preference for %s: %s", user_id, exc)
        return "balanced"
