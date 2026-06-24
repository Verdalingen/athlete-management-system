"""Supabase client — server-side only, uses service_role key (bypasses RLS)."""
from __future__ import annotations

import os

from supabase import Client, create_client

_client: Client | None = None


def get_supabase() -> Client:
    """Return a singleton Supabase client using the service_role (secret) key."""
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client
