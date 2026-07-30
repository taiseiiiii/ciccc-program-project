-- =============================================================================
-- 0003 — the V0–V17 grade scale
--
-- Reference data the application cannot run without: routes.grade_id and
-- goals.grade_id are NOT NULL foreign keys, and the UI offers a V0–V17 picker.
-- It therefore belongs in the schema history, not in db/seed.sql — a production
-- database is migrated but never seeded, and previously that left it with no
-- grades at all.
--
-- Idempotent on `level` so re-running against a database that already has the
-- scale (e.g. one built with the old seed) is a no-op.
-- =============================================================================

INSERT INTO grades (grade_name, level)
SELECT 'V' || g, g
FROM generate_series(0, 17) AS g
ON CONFLICT (level) DO NOTHING;
