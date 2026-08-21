-- =============================================================================
-- 0012 — the language a climber reads in
--
-- The interface picks its language from the browser and remembers the choice
-- in localStorage, which is enough for the UI and wrong for everything else:
-- a new phone forgets it, and the AI coach — whose text is generated on this
-- server, not translated in the browser — has no way to know which language to
-- write in.
--
-- Stored as a bare language tag ('en', 'ja') rather than a full locale: the
-- distinction between en-US and en-GB has no bearing on anything here, and a
-- CHECK is cheaper to reason about than a lookup table for a list this short.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN locale VARCHAR(5) NOT NULL DEFAULT 'en'
  CONSTRAINT chk_users_locale CHECK (locale IN ('en', 'ja'));

COMMENT ON COLUMN users.locale IS
  'Language for the interface and for AI-generated reports. Add a value here and to the CHECK before offering it in the app.';
