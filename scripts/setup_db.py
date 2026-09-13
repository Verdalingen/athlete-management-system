#!/usr/bin/env python3
"""Apply every migration in supabase/migrations/ to DATABASE_URL, in order.

One-shot replacement for pasting 40-odd files into the Supabase SQL editor by
hand. Each file is sent to Postgres as a single multi-statement query (not
split on ';' ourselves) so dollar-quoted function bodies survive intact. All
files run inside one transaction — a failure partway through rolls back
cleanly instead of leaving the schema half-applied.

Migrations are not written to be re-run — most use plain CREATE TABLE / ADD
COLUMN / CREATE POLICY without an IF NOT EXISTS or DROP-first guard, matching
the append-only convention in CLAUDE.md. Re-running this against a database
that already has the schema will fail on the first already-applied statement.
Use --seed-only to load just supabase/seed_demo.sql on top of an existing
schema instead of re-applying every migration.

Usage: pixi run setup-db [--seed | --seed-only]
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
SEED_FILE = ROOT / "supabase" / "seed_demo.sql"


def migration_sort_key(path: Path) -> tuple[int, str]:
    match = re.match(r"(\d+)_", path.name)
    number = int(match.group(1)) if match else 0
    return (number, path.name)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    seed_group = parser.add_mutually_exclusive_group()
    seed_group.add_argument(
        "--seed",
        action="store_true",
        help="also load supabase/seed_demo.sql after the migrations",
    )
    seed_group.add_argument(
        "--seed-only",
        action="store_true",
        help="skip migrations entirely and just load supabase/seed_demo.sql "
        "(for a database that already has the schema)",
    )
    parser.add_argument(
        "--database-url", help="overrides DATABASE_URL from the environment/.env"
    )
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    database_url = args.database_url or os.environ.get("DATABASE_URL")
    if not database_url:
        print(
            "DATABASE_URL is not set.\n"
            "Add it to .env — Supabase dashboard -> Project Settings -> Database\n"
            "-> Connection string (URI). Use the direct connection (port 5432),\n"
            "not the transaction pooler, so DDL runs in a normal session.",
            file=sys.stderr,
        )
        return 1

    try:
        import psycopg2
    except ImportError:
        print(
            "psycopg2 is not installed. Run this via 'pixi run setup-db' so the\n"
            "pixi environment (which includes it) is used.",
            file=sys.stderr,
        )
        return 1

    if args.seed_only:
        files = [SEED_FILE]
    else:
        files = sorted(MIGRATIONS_DIR.glob("*.sql"), key=migration_sort_key)
        if not files:
            print(f"No migration files found in {MIGRATIONS_DIR}", file=sys.stderr)
            return 1
        if args.seed:
            files.append(SEED_FILE)

    print(f"Applying {len(files)} file(s)...")
    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            for path in files:
                print(f"  -> {path.relative_to(ROOT)}")
                sql = path.read_text()
                if sql.strip():
                    cur.execute(sql)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print(f"Done — {len(files)} file(s) applied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
