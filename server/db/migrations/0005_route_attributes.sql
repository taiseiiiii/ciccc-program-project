-- =============================================================================
-- 0005 — wall angles and hold types
--
-- Both describe the ROUTE, not the climber's day, so they hang off `routes`
-- rather than `attempts`. Today the log form creates one route row per logged
-- climb, which makes the relationship effectively 1:1 — but putting them here
-- is what keeps working the day routes become shared/reusable.
--
-- Master tables + join tables rather than a text column or an array, because
-- the question these exist to answer is an aggregate one:
--
--   "success rate on overhang vs slab, at V4"
--
-- which is one GROUP BY against a join table and an unbounded string-matching
-- mess against free text. It also satisfies the project's many-to-many
-- requirement with real join tables.
--
-- The master rows are reference data the UI cannot function without (the log
-- form renders a button per row), so they are created here rather than in
-- db/seed.sql — production is migrated but never seeded.
-- =============================================================================

-- WALL TYPE (angle of the wall) -------------------------------------------------
CREATE TABLE wall_types (
  wall_type_id SERIAL PRIMARY KEY,
  code         VARCHAR(30)  NOT NULL UNIQUE,   -- stable key for code/tests
  label        VARCHAR(50)  NOT NULL,          -- what the button says
  sort_order   INTEGER      NOT NULL,          -- easiest/flattest angle first
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_wall_types_updated_at
  BEFORE UPDATE ON wall_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- HOLD TYPE ---------------------------------------------------------------------
CREATE TABLE hold_types (
  hold_type_id SERIAL PRIMARY KEY,
  code         VARCHAR(30)  NOT NULL UNIQUE,
  label        VARCHAR(50)  NOT NULL,
  sort_order   INTEGER      NOT NULL,          -- friendliest hold first
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_hold_types_updated_at
  BEFORE UPDATE ON hold_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- JOIN TABLES -------------------------------------------------------------------
-- Composite primary keys: a route cannot be tagged with the same angle twice,
-- and the PK index is exactly the one the "routes for this wall type" lookup
-- wants. ON DELETE CASCADE from routes (deleting a route drops its tags);
-- ON DELETE RESTRICT toward the master rows (a tag in use cannot be removed).

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

-- MASTER DATA -------------------------------------------------------------------
-- Idempotent on `code` so re-running against an already-populated database is
-- a no-op.

INSERT INTO wall_types (code, label, sort_order) VALUES
  ('slab',      'Slab',      10),
  ('vertical',  'Vertical',  20),
  ('overhang',  'Overhang',  30),
  ('roof',      'Roof',      40),
  ('arete',     'Arête',     50),
  ('dihedral',  'Dihedral',  60)
ON CONFLICT (code) DO NOTHING;

INSERT INTO hold_types (code, label, sort_order) VALUES
  ('jug',        'Jug',        10),
  ('crimp',      'Crimp',      20),
  ('sloper',     'Sloper',     30),
  ('pinch',      'Pinch',      40),
  ('pocket',     'Pocket',     50),
  ('sidepull',   'Sidepull',   60),
  ('undercling', 'Undercling', 70),
  ('volume',     'Volume',     80)
ON CONFLICT (code) DO NOTHING;
