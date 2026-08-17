-- =============================================================================
-- Local teardown — DESTROYS ALL DATA.
--
-- Deliberately NOT a migration: migrations run forward against live databases,
-- this only ever exists to rebuild a local database from scratch. It is run by
-- `pnpm db:reset`, which refuses to connect to anything but localhost unless
-- --force is passed.
--
-- Dropping schema_migrations too is what makes the following `migrate` step
-- replay every migration from 0001.
-- =============================================================================

-- Join tables first, then the rows they point at, then the roots. CASCADE makes
-- the order redundant, but keeping it dependency-first documents the graph.
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
DROP TABLE IF EXISTS schema_migrations  CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
