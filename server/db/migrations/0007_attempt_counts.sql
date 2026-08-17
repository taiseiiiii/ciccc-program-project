-- =============================================================================
-- 0007 — one row per route, not per try
--
-- Until now an `attempts` row was a single try, so a climber who worked a V4
-- eight times before sending it had to fill in the form eight times. From here
-- a row is "this route, in this session", carrying how many times it was tried
-- and how many of those tries topped out.
--
-- The trick that keeps this cheap: `is_success` does not disappear, it becomes
-- a GENERATED column derived from send_count. Every existing read —
-- `WHERE a.is_success`, `FILTER (WHERE a.is_success)`, `SELECT a.*` — keeps
-- working untouched. Only writes and the places that *count rows* need
-- updating (COUNT(*) -> SUM(attempt_count)).
--
-- Two figures this unlocks that the old model could not express at all:
--   * flash rate      attempt_count = 1 AND send_count = 1
--   * tries-to-send   attempt_count on rows where send_count > 0
-- =============================================================================

ALTER TABLE attempts ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE attempts ADD COLUMN send_count    INTEGER NOT NULL DEFAULT 0;

-- Carry the old data forward: a row that recorded a success was one try that
-- ended in one send; a row that recorded a failure was one try and no send.
UPDATE attempts SET send_count = 1 WHERE is_success;

-- Replace the stored boolean with a derived one. Dropping and re-adding moves
-- the column to the end of the table, which no query here depends on.
ALTER TABLE attempts DROP COLUMN is_success;
ALTER TABLE attempts
  ADD COLUMN is_success BOOLEAN GENERATED ALWAYS AS (send_count > 0) STORED;

-- A logged climb is at least one try, and you cannot send more times than you
-- tried. Enforced in the database because these are the invariants every
-- aggregate downstream assumes.
ALTER TABLE attempts ADD CONSTRAINT chk_attempts_counts
  CHECK (attempt_count >= 1 AND send_count >= 0 AND send_count <= attempt_count);

COMMENT ON TABLE attempts IS
  'One route as logged within one session: how many times it was tried and how many of those tries were sent.';
COMMENT ON COLUMN attempts.attempt_count IS 'Tries at this route in this session (>= 1).';
COMMENT ON COLUMN attempts.send_count    IS 'Tries that topped out (0 .. attempt_count).';
COMMENT ON COLUMN attempts.is_success    IS 'Derived: the route was sent at least once.';
