-- =============================================================================
-- 0009 — the climber's own layer on top of an AI report
--
-- "Save / edit / review" for AI analysis. Saving and listing already worked —
-- these rows have always been persisted snapshots. What was missing is a place
-- for the climber's own words.
--
-- Deliberately NOT making the AI text editable. The value of reviewing an old
-- report comes from it still saying what it said at the time: the climber can
-- put "this was right, my feet were the problem" next to a month-old
-- prediction, and that only works if the prediction is untouched. So
-- performance_report / training_report / analysis_data stay immutable and the
-- editable surface is these three columns.
-- =============================================================================

ALTER TABLE performances
  ADD COLUMN title     VARCHAR(120),
  ADD COLUMN user_note TEXT,
  ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE trainings
  ADD COLUMN title     VARCHAR(120),
  ADD COLUMN user_note TEXT,
  ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false;

-- The review screen leads with pinned reports, so index the flag for each
-- owner. Partial: only pinned rows are ever looked up this way, and they are
-- a small minority.
CREATE INDEX idx_performances_pinned ON performances(user_id) WHERE is_pinned;
CREATE INDEX idx_trainings_pinned    ON trainings(user_id)    WHERE is_pinned;

COMMENT ON COLUMN performances.user_note IS
  'The climber''s own reflection. The AI text above it is never edited.';
COMMENT ON COLUMN trainings.user_note IS
  'The climber''s own reflection. The AI text above it is never edited.';
