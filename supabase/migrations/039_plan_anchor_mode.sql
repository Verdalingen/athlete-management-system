-- 039: Plan anchoring mode — makes "is this plan pinned to weekdays, or is it an ordered
-- sequence?" an athlete-level property instead of an assumption baked into the scheduler.
--
-- 'weekday'  (default, = existing behaviour): sessions are pinned to specific weekdays,
--            recurring_session_requests are honoured literally, and a missed session is
--            dropped or absorbed by the next check-in's replan.
-- 'sequence': the plan is an ordered list of sessions. A missed session shifts the
--            remainder forward, preserving relative spacing (which is what actually
--            matters physiologically — weekday identity is a convenience, not a
--            training variable). Periodisation advances by sessions completed.

ALTER TABLE athlete_profile
  ADD COLUMN plan_anchor_mode TEXT NOT NULL DEFAULT 'weekday'
    CHECK (plan_anchor_mode IN ('weekday', 'sequence'));

COMMENT ON COLUMN athlete_profile.plan_anchor_mode IS
  'weekday = sessions pinned to weekdays (recurring_session_requests honoured; a missed session is dropped/absorbed by the next check-in). sequence = plan is an ordered list; a missed session shifts the remainder forward, preserving relative spacing.';
