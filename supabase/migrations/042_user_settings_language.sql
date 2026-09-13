-- 042: Athlete-selectable interface/coaching language.
--
-- `user_settings` itself was never captured in a migration (it already exists in production,
-- created out-of-band — the same class of gap the top-level CLAUDE.md warns about for 041) even
-- though web/app/actions/user-settings.ts has read/written it since MaxHRInput shipped. This
-- migration backfills its definition with `IF NOT EXISTS` (a no-op against the existing table,
-- so this is safe to run against production) so a fresh database ends up with the same shape,
-- then adds the new `language` column either way.
--
-- `language` drives three things from one setting: the web UI's language, the language the
-- LangGraph coaching workflow is instructed to write athlete-facing text in (plan rationale,
-- feedback, reports), and locale-aware date/number formatting. Stored server-side (not just a
-- browser preference) because the Python pipeline needs to read it too — the same reasoning
-- max_heart_rate_bpm already lives here rather than only in the browser.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id            uuid PRIMARY KEY REFERENCES auth.users NOT NULL,
  max_heart_rate_bpm int,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage their own user_settings" ON user_settings;
CREATE POLICY "users manage their own user_settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'
    CHECK (language IN ('en', 'no'));

COMMENT ON COLUMN user_settings.language IS
  'Athlete''s selected language: en = English, no = Norwegian (bokmål). Read by both the web app (UI text) and the coaching pipeline (LangGraph prompt instructions for athlete-facing output).';
