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

DROP TABLE IF EXISTS attempts          CASCADE;
DROP TABLE IF EXISTS routes            CASCADE;
DROP TABLE IF EXISTS sessions          CASCADE;
DROP TABLE IF EXISTS goals             CASCADE;
DROP TABLE IF EXISTS trainings         CASCADE;
DROP TABLE IF EXISTS performances      CASCADE;
DROP TABLE IF EXISTS grades            CASCADE;
DROP TABLE IF EXISTS users             CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
