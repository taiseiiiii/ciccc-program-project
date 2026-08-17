-- =============================================================================
-- 0006 — self-reported weaknesses
--
-- The form asks for a dropdown that the climber can also type into. Storing
-- that as a free-text column would produce data nobody can aggregate
-- ("footwork", "foot work", "feet" all separate). So the typed word is
-- promoted into a row the climber owns: free-text on first use, a dropdown
-- option from then on.
--
-- One table serves both kinds:
--   user_id IS NULL      -> preset, visible to everyone, seeded below
--   user_id IS NOT NULL  -> that climber's own label, only they see it
--
-- Note this is the climber's own read on why a climb went the way it did,
-- which is a different thing from `performances.analysis_data.weaknesses`
-- (the AI's read). Keeping them apart is the point: the AI Coach can compare
-- what the climber believed with what the numbers say.
-- =============================================================================

CREATE TABLE weakness_types (
  weakness_type_id SERIAL PRIMARY KEY,
  -- NULL marks a shared preset. ON DELETE CASCADE only ever fires for the
  -- custom rows, which is what should happen when an account is removed.
  user_id    INTEGER      REFERENCES users(user_id) ON DELETE CASCADE,
  label      VARCHAR(60)  NOT NULL CHECK (btrim(label) <> ''),
  sort_order INTEGER      NOT NULL DEFAULT 100,   -- presets sort first
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Two partial unique indexes rather than one over (user_id, label): in
-- PostgreSQL NULLs are distinct, so a plain unique constraint would happily
-- accept the same preset label twice.
CREATE UNIQUE INDEX uq_weakness_types_preset
  ON weakness_types(label) WHERE user_id IS NULL;
CREATE UNIQUE INDEX uq_weakness_types_custom
  ON weakness_types(user_id, label) WHERE user_id IS NOT NULL;

CREATE INDEX idx_weakness_types_user_id ON weakness_types(user_id);

CREATE TRIGGER trg_weakness_types_updated_at
  BEFORE UPDATE ON weakness_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Many-to-many: one climb can be held back by more than one thing, and one
-- weakness shows up across many climbs.
CREATE TABLE attempt_weaknesses (
  attempt_id       INTEGER NOT NULL REFERENCES attempts(attempt_id)             ON DELETE CASCADE,
  weakness_type_id INTEGER NOT NULL REFERENCES weakness_types(weakness_type_id) ON DELETE CASCADE,
  PRIMARY KEY (attempt_id, weakness_type_id)
);

CREATE INDEX idx_attempt_weaknesses_weakness_type_id
  ON attempt_weaknesses(weakness_type_id);

-- PRESETS -----------------------------------------------------------------------
-- The vocabulary climbers actually use for "why didn't I send it". Kept short:
-- a long dropdown gets skipped, and anything missing can be typed once and is
-- then permanently available to that climber.

INSERT INTO weakness_types (user_id, label, sort_order) VALUES
  (NULL, 'Finger strength',   10),
  (NULL, 'Grip / lock-off',   20),
  (NULL, 'Footwork',          30),
  (NULL, 'Core tension',      40),
  (NULL, 'Power / dynamic moves', 50),
  (NULL, 'Endurance',         60),
  (NULL, 'Reading the beta',  70),
  (NULL, 'Fear of falling',   80),
  (NULL, 'Flexibility',       90),
  (NULL, 'Balance on slab',  100)
ON CONFLICT DO NOTHING;
