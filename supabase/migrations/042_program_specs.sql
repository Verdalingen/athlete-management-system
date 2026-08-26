-- 042: program_specs — a versioned, structured, per-athlete rule set.
--
-- Replaces the pattern of encoding an athlete's training rules directly in Python
-- (weekly_planner_node.py's hardcoded 48h leg-spacing threshold and muscle-group
-- buckets, bench_wave.py's fixed 10-8-5-3 wave) with data that a generic,
-- athlete-agnostic solver (services/scheduling/solver.py) can check for global
-- feasibility. A 2026-08-25 check-in silently lost 3 of 18 required strength
-- sessions and left 2 unresolved 48h-spacing violations because the old
-- per-week auto-correction had no persistent target to check against and no
-- way to prove "this combination of rules cannot be satisfied" up front — see
-- memory project_leg_spacing_structural_limit for the full history.
--
-- Deliberately a single JSONB spec column (validated against
-- services/scheduling/program_spec.py::ProgramSpec before write) rather than a
-- normalized table per rule type: this mirrors athlete_profile's existing
-- recurring_session_requests/events columns, keeps the schema easy for an LLM to
-- author as one structured output (like weekly_planner_node's WeeklyPlanOutput),
-- and makes versioning trivial (a new row = a new version; nothing to migrate
-- across N related tables when the shape evolves).
--
-- Only one row may be status='active' per athlete at a time — that's the row
-- solver.py and any future check-in code reads. 'draft' rows (e.g. the Phase 2
-- bootstrap output, or a season-planner proposal not yet accepted) can exist
-- alongside it without being live.

CREATE TABLE program_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_from DATE NOT NULL,
  superseded_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'superseded')),
  spec JSONB NOT NULL,
  rationale TEXT,
  source TEXT NOT NULL DEFAULT 'manual_edit'
    CHECK (source IN ('llm_authored', 'manual_edit', 'bootstrap'))
);

-- At most one active spec per athlete.
CREATE UNIQUE INDEX program_specs_one_active_per_user
  ON program_specs (user_id)
  WHERE status = 'active';

CREATE INDEX program_specs_user_id_idx ON program_specs (user_id);

ALTER TABLE program_specs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own program specs"
  ON program_specs FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON COLUMN program_specs.spec IS
  'Validated against services/scheduling/program_spec.py::ProgramSpec before write — session_types, weekly_targets, spacing_constraints, day_pins, progression_schemes, rest_policy, horizon_weeks.';
