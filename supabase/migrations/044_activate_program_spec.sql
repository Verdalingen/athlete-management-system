-- 044: activate_program_spec() — atomically supersede + insert a program_specs
-- row, closing a real gap in the naive "update old row, then insert new row"
-- sequence: if the process dies between those two client-side calls, the
-- athlete is left with ZERO active specs (the partial unique index only
-- prevents more than one, not fewer). Phase 3+4 wires this in so
-- season_planner_node's auto-activate-on-feasible write can't land in that
-- half-done state. Additive only — doesn't touch the 043 table/columns.

CREATE OR REPLACE FUNCTION activate_program_spec(
  p_user_id UUID,
  p_spec JSONB,
  p_rationale TEXT,
  p_effective_from DATE,
  p_source TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  UPDATE program_specs
    SET status = 'superseded', superseded_at = now()
    WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO program_specs (user_id, spec, rationale, effective_from, status, source)
    VALUES (p_user_id, p_spec, p_rationale, p_effective_from, 'active', p_source)
    RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;
