"""Fetch per-user MyFitnessPal credentials stored in Supabase Vault."""
from __future__ import annotations

from .client import get_supabase


def get_mfp_credentials(user_id: str) -> tuple[str, str] | None:
    """Return (mfp_username, mfp_password) for the given Supabase user_id, or None if not stored."""
    sb = get_supabase()
    result = sb.rpc("get_mfp_credentials", {"p_user_id": user_id}).execute()
    rows = result.data or []
    if not rows:
        return None
    row = rows[0]
    return row["mfp_username"], row["mfp_password"]
