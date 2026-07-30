-- =============================================================================
-- Climb App — development fixtures. NOT for production.
-- Run with:  pnpm db:seed   (refuses non-local hosts unless --force)
--
-- Reference data the app genuinely requires — the V0–V17 grade scale — is NOT
-- here: it lives in db/migrations/0003_grades_master_data.sql, because
-- production databases are migrated and never seeded.
--
-- What is here is throwaway sample data:
--   * a demo user, so sessions have an owner without signing in
--   * a few sample routes
--   * one sample session
--
-- The demo user's auth_user_id is a fixed placeholder UUID that matches no real
-- Supabase user, so its data is only reachable via direct SQL. Real users get
-- their own row on first authenticated request (JIT provisioning).
--
-- Every statement is idempotent, so running this twice does not pile up
-- duplicate rows.
-- =============================================================================

-- Demo user ---------------------------------------------------------------------
INSERT INTO users (auth_user_id, email, first_name, last_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'demo@climb.app', 'Demo', 'Climber')
ON CONFLICT (email) DO NOTHING;

-- A few sample routes -----------------------------------------------------------
-- routes has no natural unique key, so guard on "same name at the same grade".
INSERT INTO routes (grade_id, route_name)
SELECT grades.grade_id, r.route_name
FROM (
  VALUES
    ('V2', 'Warm-up Slab'),
    ('V4', 'Crimpy Overhang'),
    ('V6', 'The Proj')
) AS r(grade_label, route_name)
JOIN grades ON grades.grade_name = r.grade_label
WHERE NOT EXISTS (
  SELECT 1 FROM routes existing
  WHERE existing.route_name = r.route_name
    AND existing.grade_id = grades.grade_id
);

-- A sample session for the demo user --------------------------------------------
INSERT INTO sessions (user_id, visit_date, gym_name)
SELECT users.user_id, DATE '2026-07-01', 'The Hive'
FROM users
WHERE users.email = 'demo@climb.app'
  AND NOT EXISTS (
    SELECT 1 FROM sessions existing
    WHERE existing.user_id = users.user_id
      AND existing.visit_date = DATE '2026-07-01'
      AND existing.gym_name = 'The Hive'
  );
