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
DROP TABLE IF EXISTS attempts     CASCADE;
DROP TABLE IF EXISTS routes       CASCADE;
DROP TABLE IF EXISTS sessions     CASCADE;
DROP TABLE IF EXISTS goals        CASCADE;
DROP TABLE IF EXISTS trainings    CASCADE;
DROP TABLE IF EXISTS performances CASCADE;
DROP TABLE IF EXISTS grades       CASCADE;
DROP TABLE IF EXISTS users        CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

-- Shared trigger: keep updated_at in sync on every UPDATE ------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- USER --------------------------------------------------------------------------
CREATE TABLE users (
  user_id       SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
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
  session_id SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  gym_name   VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ATTEMPT (one try at a route within a session) ---------------------------------
CREATE TABLE attempts (
  attempt_id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  route_id   INTEGER NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
  is_success BOOLEAN NOT NULL DEFAULT false,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_performances_user_id ON performances(user_id);

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
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trainings_user_id ON trainings(user_id);

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
