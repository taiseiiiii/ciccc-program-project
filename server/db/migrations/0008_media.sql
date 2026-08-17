-- =============================================================================
-- 0008 — photos and videos
--
-- Only metadata lives here. The bytes go to Supabase Storage, uploaded by the
-- browser directly with the climber's own access token, and this server never
-- touches a file body: no multipart parsing, no memory spike, no request that
-- outlives a free-tier instance's timeout. The client uploads first and posts
-- the resulting path second, so a failed upload simply leaves no row.
--
-- storage_path is the object key inside the bucket and is UNIQUE, which makes
-- a retried POST idempotent rather than duplicating the attachment. The path
-- always starts with the uploader's auth_user_id because the bucket's RLS
-- policy keys on that first path segment:
--
--   (storage.foldername(name))[1] = auth.uid()::text
--
-- A row hangs off an attempt (this specific climb) or a session (the visit in
-- general); the CHECK makes sure it hangs off at least one of them. Both FKs
-- cascade, so deleting a session takes its attachments' rows with it — see
-- MANUAL_SETUP.md for why the objects themselves need a separate sweep.
-- =============================================================================

CREATE TABLE media (
  media_id         SERIAL PRIMARY KEY,
  -- Denormalised owner. Ownership could be reached through session/attempt,
  -- but every listing filters by it and the join would differ per parent.
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

COMMENT ON COLUMN media.storage_path IS
  'Object key in the climb-media bucket, always "<auth_user_id>/<yyyy>/<mm>/<uuid>.<ext>".';
