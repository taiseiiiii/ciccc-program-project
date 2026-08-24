-- =============================================================================
-- 0013 — what actually gets shared
--
-- The share feature draws its cards in the browser and hands the result to the
-- OS share sheet. Nothing about that touches this server, which means that
-- without this table the whole point of offering three templates and two
-- formats is lost: we would be guessing which of them anyone uses, and guessing
-- is what this feature was built to stop doing.
--
-- One row per export. Append-only — an event is a thing that happened, so there
-- is no updated_at and no trigger. The columns are deliberately the two
-- questions worth answering:
--
--   template  which card was chosen (one climb / one visit / the month)
--   format    the image card, or the video with the overlay burned in
--
-- `outcome` separates handing the file to the OS share sheet from saving it to
-- the device. Neither tells us whether it reached Instagram — navigator.share
-- does not report where the user sent it — so do not read this as a post count.
--
-- No media, no route names, no free text: this is a counter, not a log of what
-- anyone shared.
-- =============================================================================

CREATE TABLE share_events (
  share_event_id SERIAL      PRIMARY KEY,
  user_id        INTEGER     NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  template       VARCHAR(20) NOT NULL
                   CHECK (template IN ('climb', 'session', 'month')),
  format         VARCHAR(10) NOT NULL
                   CHECK (format IN ('image', 'video')),
  outcome        VARCHAR(10) NOT NULL
                   CHECK (outcome IN ('shared', 'saved')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only query anyone runs against this: counts per template/format over a
-- window, for one user or for all of them.
CREATE INDEX idx_share_events_created ON share_events(created_at DESC);
CREATE INDEX idx_share_events_user_created ON share_events(user_id, created_at DESC);

-- Same reasoning as migration 0002: RLS on with no policies denies anon and
-- authenticated everything, while the owner this server connects as stays
-- exempt. Never add FORCE ROW LEVEL SECURITY.
ALTER TABLE share_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE share_events IS
  'One row per shared/saved card or video. A counter for deciding which templates to keep — not a record of content.';
