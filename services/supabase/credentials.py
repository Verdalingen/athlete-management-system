"""Fetch per-user Garmin credentials stored in Supabase Vault."""
from __future__ import annotations

from .client import get_supabase, rows


def get_garmin_credentials(user_id: str) -> tuple[str, str] | None:
    """Return (garmin_email, garmin_password) for the given Supabase user_id, or None if not stored."""
    sb = get_supabase()
    found = rows(sb.rpc("get_garmin_credentials", {"p_user_id": user_id}).execute())
    if not found:
        return None
    return found[0]["garmin_email"], found[0]["garmin_password"]
