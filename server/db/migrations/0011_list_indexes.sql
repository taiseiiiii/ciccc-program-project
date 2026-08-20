-- =============================================================================
-- 0011 — indexes for the paginated list screens
--
-- Three lists are about to start paging rather than returning everything:
-- the AI report browser (performances, trainings) and the new sessions screen
-- with its search filters. Each of them orders by owner and then by recency,
-- and none of the existing indexes covers that pair.
--
-- 0009 added partial indexes on `is_pinned`, which serve the "pinned first"
-- half of the report ordering. They do nothing for the `created_at DESC` tail,
-- which is what an OFFSET walks. These fill that in.
-- =============================================================================

CREATE INDEX idx_performances_user_created
  ON performances(user_id, created_at DESC);

CREATE INDEX idx_trainings_user_created
  ON trainings(user_id, created_at DESC);

-- The sessions list sorts by visit_date (the day the climber was at the gym),
-- not created_at (the day they got round to typing it in). Date-range search
-- filters on the same column, so this index serves both.
CREATE INDEX idx_sessions_user_visit
  ON sessions(user_id, visit_date DESC);
