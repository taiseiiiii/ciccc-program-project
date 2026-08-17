-- =============================================================================
-- 0004 — how long the climber was actually on the wall
--
-- Stored as minutes rather than start/end timestamps: the climber types one
-- number instead of two clock times, and every figure the app wants out of it
-- (monthly total, session average, sends per hour) is a plain SUM/AVG.
--
-- Nullable on purpose — sessions logged before this migration have no duration,
-- and a climber who forgot to time a session should not be forced to invent one.
-- =============================================================================

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER
    CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440);

COMMENT ON COLUMN sessions.duration_minutes IS
  'Time spent climbing during this visit, in minutes. NULL = not recorded.';
