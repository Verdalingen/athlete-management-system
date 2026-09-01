"""Supabase client — server-side only, uses service_role key (bypasses RLS)."""
from __future__ import annotations

import os
from functools import cache

from supabase import Client, create_client


@cache
def get_supabase() -> Client:
    """Return a singleton Supabase client using the service_role (secret) key."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)
