-- =============================================================================
-- Climb App — seed data (development only)
-- Run AFTER schema.sql:  psql "$DATABASE_URL" -f db/seed.sql
--
-- Provides enough reference data for the sample /sessions endpoints to work:
--   * one demo user (so sessions have an owner)
--   * the V0–V17 grade scale
--   * a couple of routes
-- The demo user's auth_user_id is a fixed placeholder UUID; it does not match
-- any real Supabase user, so its data is only reachable via direct SQL. Real
-- users get their own row on first authenticated request (JIT provisioning).
-- =============================================================================

-- Demo user ---------------------------------------------------------------------
INSERT INTO users (auth_user_id, email, first_name, last_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'demo@climb.app', 'Demo', 'Climber')
ON CONFLICT (email) DO NOTHING;

-- Grade scale V0–V17 ------------------------------------------------------------
INSERT INTO grades (grade_name, level)
SELECT 'V' || g, g
FROM generate_series(0, 17) AS g
ON CONFLICT (level) DO NOTHING;

-- A few sample routes -----------------------------------------------------------
INSERT INTO routes (grade_id, route_name)
SELECT grade_id, route_name
FROM (
  VALUES
    ('V2', 'Warm-up Slab'),
    ('V4', 'Crimpy Overhang'),
    ('V6', 'The Proj')
) AS r(grade_label, route_name)
JOIN grades ON grades.grade_name = r.grade_label;

-- A sample session for the demo user --------------------------------------------
INSERT INTO sessions (user_id, visit_date, gym_name)
SELECT user_id, DATE '2026-07-01', 'The Hive'
FROM users
WHERE email = 'demo@climb.app';
