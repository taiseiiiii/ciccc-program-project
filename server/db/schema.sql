-- =============================================================================
-- Climb App — database schema
-- Derived directly from required/climb-app-erd.md
--
-- Notes:
--   * Table names are pluralized; "user" is a reserved word in Postgres so the
--     table is named "users".
--   * updated_at is maintained automatically by the trigger defined below.
--   * Run with:  psql "$DATABASE_URL" -f db/schema.sql
-- =============================================================================

-- Reset (safe to re-run during development) --------------------------------------
DROP TABLE IF EXISTS attempt_weaknesses CASCADE;
DROP TABLE IF EXISTS route_wall_types   CASCADE;
DROP TABLE IF EXISTS route_hold_types   CASCADE;
DROP TABLE IF EXISTS injury_logs        CASCADE;
DROP TABLE IF EXISTS media              CASCADE;
DROP TABLE IF EXISTS attempts           CASCADE;
DROP TABLE IF EXISTS routes             CASCADE;
DROP TABLE IF EXISTS sessions           CASCADE;
DROP TABLE IF EXISTS goals              CASCADE;
DROP TABLE IF EXISTS trainings          CASCADE;
DROP TABLE IF EXISTS performances       CASCADE;
DROP TABLE IF EXISTS injuries           CASCADE;
DROP TABLE IF EXISTS weakness_types     CASCADE;
DROP TABLE IF EXISTS wall_types         CASCADE;
DROP TABLE IF EXISTS hold_types         CASCADE;
DROP TABLE IF EXISTS body_parts         CASCADE;
DROP TABLE IF EXISTS grades             CASCADE;
DROP TABLE IF EXISTS users              CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

-- Shared trigger: keep updated_at in sync on every UPDATE ------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- USER --------------------------------------------------------------------------
-- Authentication is delegated to Supabase Auth: auth_user_id stores the
-- Supabase user id (JWT `sub`) and rows are provisioned on first authenticated
-- request. No credentials are stored here.
CREATE TABLE users (
  user_id       SERIAL PRIMARY KEY,
  auth_user_id  UUID NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  first_name    VARCHAR(100),
  last_name     VARCHAR(100),
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'withdrawn', 'suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- GRADE (V0–V17) ----------------------------------------------------------------
CREATE TABLE grades (
  grade_id   SERIAL PRIMARY KEY,
  grade_name VARCHAR(20) NOT NULL,          -- label, e.g. "V0" .. "V17"
  level      INTEGER NOT NULL UNIQUE,       -- ordering, 0..17
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_grades_updated_at
  BEFORE UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ROUTE -------------------------------------------------------------------------
CREATE TABLE routes (
  route_id   SERIAL PRIMARY KEY,
  grade_id   INTEGER NOT NULL REFERENCES grades(grade_id) ON DELETE RESTRICT,
  route_name VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_routes_grade_id ON routes(grade_id);

CREATE TRIGGER trg_routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- SESSION (a gym visit) ---------------------------------------------------------
CREATE TABLE sessions (
  session_id       SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  visit_date       DATE NOT NULL,
  gym_name         VARCHAR(150),
  -- Time on the wall. Minutes, not start/end times: one input instead of two,
  -- and every derived figure is a plain SUM/AVG.
  duration_minutes INTEGER
    CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ATTEMPT (one route as logged within a session) ---------------------------------
-- A row is "this route, in this visit" — how many times it was tried and how
-- many of those tries topped out. is_success is derived, not stored, so every
-- query written against the old one-row-per-try model keeps working.
CREATE TABLE attempts (
  attempt_id    SERIAL PRIMARY KEY,
  session_id    INTEGER NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  route_id      INTEGER NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  send_count    INTEGER NOT NULL DEFAULT 0,
  is_success    BOOLEAN GENERATED ALWAYS AS (send_count > 0) STORED,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_attempts_counts
    CHECK (attempt_count >= 1 AND send_count >= 0 AND send_count <= attempt_count)
);

CREATE INDEX idx_attempts_session_id ON attempts(session_id);
CREATE INDEX idx_attempts_route_id   ON attempts(route_id);

CREATE TRIGGER trg_attempts_updated_at
  BEFORE UPDATE ON attempts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- PERFORMANCE (AI-generated report snapshot) ------------------------------------
CREATE TABLE performances (
  performance_id     SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  period_type        VARCHAR(20) NOT NULL
                       CHECK (period_type IN ('daily', 'monthly')),
  period_start       DATE NOT NULL,
  period_end         DATE NOT NULL,
  performance_report TEXT,
  ai_model           VARCHAR(100),
  analysis_data      JSONB,
  -- The climber's own layer. The AI text above is never edited, so a saved
  -- report still says what it said when it was generated.
  title              VARCHAR(120),
  user_note          TEXT,
  is_pinned          BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_performances_user_id ON performances(user_id);
CREATE INDEX idx_performances_pinned  ON performances(user_id) WHERE is_pinned;

CREATE TRIGGER trg_performances_updated_at
  BEFORE UPDATE ON performances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- TRAINING (AI-generated training report) ---------------------------------------
CREATE TABLE trainings (
  training_id     SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  training_report TEXT,
  ai_model        VARCHAR(100),
  analysis_data   JSONB,
  title           VARCHAR(120),
  user_note       TEXT,
  is_pinned       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trainings_user_id ON trainings(user_id);
CREATE INDEX idx_trainings_pinned  ON trainings(user_id) WHERE is_pinned;

CREATE TRIGGER trg_trainings_updated_at
  BEFORE UPDATE ON trainings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- GOAL --------------------------------------------------------------------------
CREATE TABLE goals (
  goal_id          SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  grade_id         INTEGER NOT NULL REFERENCES grades(grade_id) ON DELETE RESTRICT,
  goal_description TEXT,
  is_achieved      BOOLEAN NOT NULL DEFAULT false,
  achieved_at      TIMESTAMPTZ,             -- NULL until achieved
  target_date      DATE,                    -- optional deadline
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goals_user_id  ON goals(user_id);
CREATE INDEX idx_goals_grade_id ON goals(grade_id);

CREATE TRIGGER trg_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- WALL TYPE / HOLD TYPE (master) -------------------------------------------------
-- Route characteristics, tagged many-to-many. They describe the route, not the
-- climber's day, so they hang off routes rather than attempts. Master tables
-- rather than text columns because the question they exist to answer is an
-- aggregate one ("success rate on overhang vs slab at V4").
CREATE TABLE wall_types (
  wall_type_id SERIAL PRIMARY KEY,
  code         VARCHAR(30) NOT NULL UNIQUE,
  label        VARCHAR(50) NOT NULL,
  sort_order   INTEGER     NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_wall_types_updated_at
  BEFORE UPDATE ON wall_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE hold_types (
  hold_type_id SERIAL PRIMARY KEY,
  code         VARCHAR(30) NOT NULL UNIQUE,
  label        VARCHAR(50) NOT NULL,
  sort_order   INTEGER     NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_hold_types_updated_at
  BEFORE UPDATE ON hold_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE route_wall_types (
  route_id     INTEGER NOT NULL REFERENCES routes(route_id)         ON DELETE CASCADE,
  wall_type_id INTEGER NOT NULL REFERENCES wall_types(wall_type_id) ON DELETE RESTRICT,
  PRIMARY KEY (route_id, wall_type_id)
);

CREATE INDEX idx_route_wall_types_wall_type_id ON route_wall_types(wall_type_id);

CREATE TABLE route_hold_types (
  route_id     INTEGER NOT NULL REFERENCES routes(route_id)         ON DELETE CASCADE,
  hold_type_id INTEGER NOT NULL REFERENCES hold_types(hold_type_id) ON DELETE RESTRICT,
  PRIMARY KEY (route_id, hold_type_id)
);

CREATE INDEX idx_route_hold_types_hold_type_id ON route_hold_types(hold_type_id);

-- WEAKNESS TYPE ------------------------------------------------------------------
-- Presets (user_id IS NULL) and each climber's own labels live in one table.
-- A typed-in weakness is promoted to a row so it becomes a dropdown option
-- next time — free text for the climber, structured data for the aggregates.
CREATE TABLE weakness_types (
  weakness_type_id SERIAL PRIMARY KEY,
  user_id    INTEGER     REFERENCES users(user_id) ON DELETE CASCADE,
  label      VARCHAR(60) NOT NULL CHECK (btrim(label) <> ''),
  sort_order INTEGER     NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NULLs are distinct in PostgreSQL, so a plain UNIQUE(user_id, label) would
-- let the same preset label in twice. Two partial indexes instead.
CREATE UNIQUE INDEX uq_weakness_types_preset ON weakness_types(label)          WHERE user_id IS NULL;
CREATE UNIQUE INDEX uq_weakness_types_custom ON weakness_types(user_id, label) WHERE user_id IS NOT NULL;
CREATE INDEX idx_weakness_types_user_id ON weakness_types(user_id);

CREATE TRIGGER trg_weakness_types_updated_at
  BEFORE UPDATE ON weakness_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE attempt_weaknesses (
  attempt_id       INTEGER NOT NULL REFERENCES attempts(attempt_id)             ON DELETE CASCADE,
  weakness_type_id INTEGER NOT NULL REFERENCES weakness_types(weakness_type_id) ON DELETE CASCADE,
  PRIMARY KEY (attempt_id, weakness_type_id)
);

CREATE INDEX idx_attempt_weaknesses_weakness_type_id ON attempt_weaknesses(weakness_type_id);

-- MEDIA --------------------------------------------------------------------------
-- Metadata only. The bytes live in Supabase Storage, uploaded by the browser
-- straight to the bucket; this server never handles a file body.
CREATE TABLE media (
  media_id         SERIAL PRIMARY KEY,
  user_id          INTEGER     NOT NULL REFERENCES users(user_id)       ON DELETE CASCADE,
  session_id       INTEGER              REFERENCES sessions(session_id) ON DELETE CASCADE,
  attempt_id       INTEGER              REFERENCES attempts(attempt_id) ON DELETE CASCADE,
  storage_path     TEXT        NOT NULL UNIQUE,
  kind             VARCHAR(10) NOT NULL CHECK (kind IN ('photo', 'video')),
  mime_type        VARCHAR(80) NOT NULL,
  byte_size        BIGINT      NOT NULL CHECK (byte_size > 0),
  duration_seconds INTEGER     CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_media_has_parent
    CHECK (session_id IS NOT NULL OR attempt_id IS NOT NULL)
);

CREATE INDEX idx_media_user_id    ON media(user_id);
CREATE INDEX idx_media_session_id ON media(session_id);
CREATE INDEX idx_media_attempt_id ON media(attempt_id);

CREATE TRIGGER trg_media_updated_at
  BEFORE UPDATE ON media
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- INJURY --------------------------------------------------------------------------
-- Records injuries and manages load. Deliberately carries no diagnosis or
-- treatment column: naming a condition or prescribing rehab is medical advice
-- this app does not give. An active injury is an input to training-plan
-- generation, so the plan routes around the hurt body part.
CREATE TABLE body_parts (
  body_part_id SERIAL PRIMARY KEY,
  code         VARCHAR(30) NOT NULL UNIQUE,
  label        VARCHAR(50) NOT NULL,
  sort_order   INTEGER     NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_body_parts_updated_at
  BEFORE UPDATE ON body_parts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE injuries (
  injury_id    SERIAL PRIMARY KEY,
  user_id      INTEGER     NOT NULL REFERENCES users(user_id)           ON DELETE CASCADE,
  body_part_id INTEGER     NOT NULL REFERENCES body_parts(body_part_id) ON DELETE RESTRICT,
  side         VARCHAR(10) CHECK (side IS NULL OR side IN ('left', 'right', 'both')),
  occurred_on  DATE        NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'recovering', 'healed')),
  severity     SMALLINT    CHECK (severity IS NULL OR severity BETWEEN 1 AND 5),
  description  TEXT,
  resolved_on  DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_injuries_resolved
    CHECK ((status = 'healed') = (resolved_on IS NOT NULL)),
  CONSTRAINT chk_injuries_dates
    CHECK (resolved_on IS NULL OR resolved_on >= occurred_on)
);

CREATE INDEX idx_injuries_user_id ON injuries(user_id);
CREATE INDEX idx_injuries_open    ON injuries(user_id) WHERE status <> 'healed';

CREATE TRIGGER trg_injuries_updated_at
  BEFORE UPDATE ON injuries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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
