-- Migration 009: Athlete memory — persistent coaching context across pipeline runs
-- Stores key facts about the athlete that the coach should remember across sessions.
-- Written by the CLI/pipeline after each run; injected into expert prompts at runtime.

CREATE TABLE athlete_memory (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,   -- e.g. 'goals', 'injuries', 'preferences', 'observations'
  key          TEXT NOT NULL,   -- e.g. 'primary_goal', 'left_knee_issue'
  value        TEXT NOT NULL,   -- the fact or observation
  confidence   SMALLINT DEFAULT 80 CHECK (confidence BETWEEN 0 AND 100),
  source       TEXT,            -- 'user_stated', 'coach_inferred', 'athlete_profile'
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, category, key)
);

ALTER TABLE athlete_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own athlete memory"
  ON athlete_memory FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can also read/write (needed for pipeline)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_memory TO service_role;
GRANT SELECT ON public.athlete_memory TO authenticated;

CREATE INDEX athlete_memory_user_category ON athlete_memory (user_id, category);

-- ── RPC: get all memory for a user as formatted text ─────────────────────────
CREATE OR REPLACE FUNCTION get_athlete_memory(p_user_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result TEXT := '';
  v_row RECORD;
  v_current_category TEXT := '';
BEGIN
  FOR v_row IN
    SELECT category, key, value, confidence, source
    FROM athlete_memory
    WHERE user_id = p_user_id
    ORDER BY category, key
  LOOP
    IF v_row.category != v_current_category THEN
      v_result := v_result || E'\n### ' || upper(v_row.category) || E'\n';
      v_current_category := v_row.category;
    END IF;
    v_result := v_result || '- ' || v_row.key || ': ' || v_row.value;
    IF v_row.confidence < 80 THEN
      v_result := v_result || ' (confidence: ' || v_row.confidence || '%)';
    END IF;
    v_result := v_result || E'\n';
  END LOOP;
  RETURN v_result;
END;
$$;

-- ── RPC: upsert a single memory entry ────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_athlete_memory(
  p_user_id   uuid,
  p_category  text,
  p_key       text,
  p_value     text,
  p_confidence smallint DEFAULT 80,
  p_source    text DEFAULT 'coach_inferred'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO athlete_memory (user_id, category, key, value, confidence, source, updated_at)
  VALUES (p_user_id, p_category, p_key, p_value, p_confidence, p_source, now())
  ON CONFLICT (user_id, category, key)
  DO UPDATE SET value = EXCLUDED.value,
                confidence = EXCLUDED.confidence,
                source = EXCLUDED.source,
                updated_at = now();
END;
$$;
