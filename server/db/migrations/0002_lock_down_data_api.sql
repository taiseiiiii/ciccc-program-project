-- =============================================================================
-- 0002 — lock the app tables away from Supabase's Data API
--
-- Only this Express server is allowed to touch these tables, and it connects
-- directly as their owner. Nothing should reach them through PostgREST.
--
-- Three independent layers, cheapest and most decisive first:
--   1. Disabling the Data API in the dashboard  <- do this too, it is not SQL
--   2. Grants      — whether anon/authenticated may touch a table at all
--   3. RLS         — which rows they may see once they can
--
-- Supabase granted select/insert/update/delete on every public table to anon,
-- authenticated and service_role by default; projects created from 2026-05-30
-- no longer do. This migration makes the outcome explicit either way.
--
-- Why enabling RLS with zero policies is safe here: in PostgreSQL a table's
-- OWNER is exempt from RLS unless the table is marked FORCE ROW LEVEL SECURITY.
-- The server connects as the owner, so its queries are unaffected, while
-- anon/authenticated (which own nothing) can read no rows and write none.
--
--   * Never add FORCE ROW LEVEL SECURITY to these tables — it would strip the
--     owner's exemption and every server query would silently return 0 rows.
--   * If the server is ever switched to a least-privilege non-owner role, that
--     role needs BYPASSRLS (or real policies), or it will see nothing.
--
-- Portable: the role checks make this a no-op on a plain local Postgres, where
-- anon/authenticated do not exist.
-- =============================================================================

-- Layer 3: RLS on, deliberately no policies -> deny-all for non-owner roles ------
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades       ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals        ENABLE ROW LEVEL SECURITY;

-- Layer 2: strip the API roles' privileges, now and for future objects ----------
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      -- Applies to objects created later by the role running this migration.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
        api_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
        api_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I',
        api_role);
      RAISE NOTICE 'revoked public-schema privileges from %', api_role;
    ELSE
      RAISE NOTICE 'role % does not exist, skipping (not a Supabase database)', api_role;
    END IF;
  END LOOP;
END $$;
