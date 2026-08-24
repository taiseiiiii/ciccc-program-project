-- =============================================================================
-- 0014 — the third share format
--
-- 0013 recorded two: the generated card, and the climber's video with the
-- overlay burned into it. Between them was a gap nobody noticed until the
-- feature was on a phone — the climbers who photograph a send rather than
-- filming it, who are most of them. They had only the card, which carries no
-- picture of the climb at all.
--
-- 'photo' is that middle case: the same overlay the video gets, composited onto
-- a still instead. Distinguished from 'image' rather than folded into it,
-- because the question these rows exist to answer is which of the three people
-- reach for, and a photo the climber supplied is a different act from a card
-- the app drew.
--
-- The constraint is replaced rather than the column retyped: an enum type would
-- need its own migration path every time this list grows, and it has now grown
-- once already.
-- =============================================================================

ALTER TABLE share_events DROP CONSTRAINT share_events_format_check;

ALTER TABLE share_events
  ADD CONSTRAINT share_events_format_check
  CHECK (format IN ('image', 'photo', 'video'));

COMMENT ON COLUMN share_events.format IS
  'image = the generated card; photo = the climber''s photo with the overlay; video = their video with the overlay.';
