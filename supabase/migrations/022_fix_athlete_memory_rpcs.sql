-- Migration 022: athlete_memory table exists live but its RLS policy and RPC
-- functions from migration 009 were never actually applied (only the bare
-- CREATE TABLE landed) — get_athlete_memory/upsert_athlete_memory calls from
-- both AI generation paths have been silently failing. Complete the setup.

ALTER TABLE public.athlete_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own athlete memory" ON public.athlete_memory;
CREATE POLICY "Users manage own athlete memory"
  ON public.athlete_memory FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

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
