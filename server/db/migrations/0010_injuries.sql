-- =============================================================================
-- 0010 — injuries and recovery
--
-- Scope note, because it shapes every column below: this app records injuries
-- and manages load. It does not diagnose and it does not prescribe treatment.
-- There is therefore no "diagnosis" or "treatment_plan" column — storing one
-- would invite the AI coach to fill it in, and naming a condition or handing
-- out a rehab protocol is medical advice this project is not in a position to
-- give. What is stored is what the climber can observe (where it hurts, how
-- much, since when) and what the app can safely act on (avoid loading it).
--
-- The payoff for the product: an active injury becomes an input to training
-- plan generation, so the plan routes around the hurt body part instead of
-- ignoring it — and the climber has a reason to open the app on the days they
-- cannot climb.
-- =============================================================================

-- BODY PART (master) ------------------------------------------------------------
-- Reference data: the injury form renders one button per row, and the AI
-- guardrail matches drill text against these labels.
CREATE TABLE body_parts (
  body_part_id SERIAL PRIMARY KEY,
  code         VARCHAR(30)  NOT NULL UNIQUE,
  label        VARCHAR(50)  NOT NULL,
  sort_order   INTEGER      NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_body_parts_updated_at
  BEFORE UPDATE ON body_parts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- INJURY ------------------------------------------------------------------------
CREATE TABLE injuries (
  injury_id    SERIAL PRIMARY KEY,
  user_id      INTEGER     NOT NULL REFERENCES users(user_id)           ON DELETE CASCADE,
  body_part_id INTEGER     NOT NULL REFERENCES body_parts(body_part_id) ON DELETE RESTRICT,
  side         VARCHAR(10) CHECK (side IS NULL OR side IN ('left', 'right', 'both')),
  occurred_on  DATE        NOT NULL,
  -- active     = currently limiting climbing, plans must route around it
  -- recovering = returning to load, plans may include it cautiously
  -- healed     = historical record only
  status       VARCHAR(20) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'recovering', 'healed')),
  severity     SMALLINT    CHECK (severity IS NULL OR severity BETWEEN 1 AND 5),
  description  TEXT,
  resolved_on  DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A healed injury has an end date; an unhealed one cannot have one yet.
  CONSTRAINT chk_injuries_resolved
    CHECK ((status = 'healed') = (resolved_on IS NOT NULL)),
  CONSTRAINT chk_injuries_dates
    CHECK (resolved_on IS NULL OR resolved_on >= occurred_on)
);

CREATE INDEX idx_injuries_user_id ON injuries(user_id);
-- The hot query is "does this climber have anything active right now", asked
-- on every training-plan generation and on every dashboard load.
CREATE INDEX idx_injuries_open ON injuries(user_id) WHERE status <> 'healed';

CREATE TRIGGER trg_injuries_updated_at
  BEFORE UPDATE ON injuries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- INJURY LOG (daily check-in) ---------------------------------------------------
-- One entry per injury per day — the UNIQUE is what makes the check-in an
-- upsert instead of a way to log the same day twice.
CREATE TABLE injury_logs (
  injury_log_id SERIAL PRIMARY KEY,
  injury_id     INTEGER     NOT NULL REFERENCES injuries(injury_id) ON DELETE CASCADE,
  logged_on     DATE        NOT NULL,
  pain_level    SMALLINT    NOT NULL CHECK (pain_level BETWEEN 0 AND 10),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_injury_logs_day UNIQUE (injury_id, logged_on)
);

CREATE INDEX idx_injury_logs_injury_id ON injury_logs(injury_id);

CREATE TRIGGER trg_injury_logs_updated_at
  BEFORE UPDATE ON injury_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- MASTER DATA -------------------------------------------------------------------
-- The parts that actually stop boulderers. Ordered fingers-first because that
-- is where the overwhelming majority of climbing injuries land.
INSERT INTO body_parts (code, label, sort_order) VALUES
  ('finger',   'Finger / pulley', 10),
  ('wrist',    'Wrist',           20),
  ('elbow',    'Elbow',           30),
  ('shoulder', 'Shoulder',        40),
  ('back',     'Back',            50),
  ('hip',      'Hip',             60),
  ('knee',     'Knee',            70),
  ('ankle',    'Ankle',           80),
  ('other',    'Other',           90)
ON CONFLICT (code) DO NOTHING;
