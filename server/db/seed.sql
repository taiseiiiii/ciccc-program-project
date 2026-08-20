-- =============================================================================
-- Climb App — development fixtures. NOT for production.
-- Run with:  pnpm db:seed   (refuses non-local hosts unless --force)
--
-- Reference data the app genuinely requires — the V0–V17 grade scale, the wall
-- angles, hold types, weakness presets and body parts — is NOT here: it lives
-- in db/migrations/, because production databases are migrated and never
-- seeded.
--
-- What is here is a believable ten weeks of climbing, built so every screen has
-- something real to show:
--
--   * 14 sessions over ~10 weeks, no gap longer than a week
--     -> the weekly streak, the heatmap and the monthly charts all populate
--   * grades drifting V2/V3 -> V4/V5 over that period
--     -> the grade-progress line climbs instead of sitting flat
--   * routes worked over many tries next to routes flashed
--     -> flash rate and average tries-to-send are meaningful
--   * every route tagged with a wall angle and hold types, weighted so that
--     overhangs really are this climber's weak point
--     -> the wall-angle chart shows an insight rather than four equal bars
--   * the climber's own notes and self-reported weaknesses
--     -> the AI coach has something to interpret and disagree with
--   * one healed injury and one still recovering
--     -> the dashboard banner, the pain chart and the AI guardrail are all live
--
-- Dates are relative to CURRENT_DATE, so this stays useful whenever it is run.
--
-- Deliberately NOT seeded: `performances` and `trainings`. Those are AI output,
-- and fabricating them would mean demoing a coach that never ran. Generate one
-- live from the AI Coach screen — the data below is enough for it to work.
--
-- All of it is attached to one demo account, named in section 0. That account
-- must already exist in Supabase Auth; this file will not invent one, because a
-- `users` row without a matching Auth user cannot be signed in as.
--
-- Re-running is safe: the cleanup block removes the previous run first.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Which account owns this data
-- -----------------------------------------------------------------------------
-- Set the demo account's email here. This is the only line to change.
DROP TABLE IF EXISTS seed_config;
CREATE TEMP TABLE seed_config (demo_email text);
INSERT INTO seed_config VALUES ('demo@climblog.app');   -- <<< CHANGE ME
--
-- The account has to exist in Supabase Auth first — this file cannot create it.
-- Authentication is delegated, so a `users` row is only half of an account:
-- without a matching Supabase Auth user, nobody can sign in and the data is
-- invisible in the app. (That is exactly what the old placeholder demo user
-- was: a row nobody could ever log in as.)
--
-- To create it, once:
--
--   1. Sign up through the app's /auth screen with the email above
--   2. Confirm the email
--   3. Sign in once — the server provisions the `users` row on the first
--      authenticated request (see middleware/auth.ts)
--
-- If that address cannot receive mail, use a plus-address on an inbox you own
-- (gmail delivers `you+demo@gmail.com` to `you@gmail.com`) and put that here.

DROP TABLE IF EXISTS seed_target;
CREATE TEMP TABLE seed_target AS
SELECT u.user_id, u.auth_user_id, u.email
  FROM users u
  JOIN seed_config c ON u.email = c.demo_email;

DO $$
DECLARE
  wanted text := (SELECT demo_email FROM seed_config);
  known  text := (SELECT string_agg(email, ', ' ORDER BY user_id) FROM users);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM seed_target) THEN
    RAISE EXCEPTION
      E'No account "%" in the users table.\n'
       '  Sign up with it in the app, confirm the email, then sign in once —\n'
       '  the users row is created on the first authenticated request.\n'
       '  Accounts that do exist: %',
      wanted, COALESCE(known, '(none)');
  END IF;

  -- A row whose auth_user_id is the old fixed placeholder can never be signed
  -- in as, so seeding it produces data that only SQL can see.
  IF EXISTS (
    SELECT 1 FROM seed_target
     WHERE auth_user_id = '00000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION
      E'"%" is the legacy placeholder account — its auth_user_id matches no\n'
       '  Supabase Auth user, so nothing seeded onto it would be visible in the\n'
       '  app. Create a real demo account instead.', wanted;
  END IF;
END $$;

-- Retire the placeholder account the previous version of this file created.
-- Unambiguously seed output (that UUID is hard-coded here and nowhere else) and
-- unusable by design, so removing it just avoids future confusion. Its sessions
-- and goals go with it.
DELETE FROM users
 WHERE auth_user_id = '00000000-0000-0000-0000-000000000001';


-- -----------------------------------------------------------------------------
-- 1. Clear the previous run
-- -----------------------------------------------------------------------------
-- Matched on the three demo gym names, so sessions logged anywhere else survive.
-- Deleting a session cascades to its attempts, their tags and their media rows.
-- (It does not remove files from Storage — see MANUAL_SETUP.md.)
DELETE FROM sessions
 WHERE user_id IN (SELECT user_id FROM seed_target)
   AND gym_name IN ('The Hive', 'Cliffhanger', 'Ground Up');

-- Routes are shared reference rows with no owner, so they are matched by name.
-- ON DELETE RESTRICT from attempts means this only succeeds once the sessions
-- above are gone.
DELETE FROM routes
 WHERE route_name LIKE '[seed]%';

DELETE FROM goals
 WHERE user_id IN (SELECT user_id FROM seed_target)
   AND goal_description LIKE '[seed]%';

DELETE FROM injuries
 WHERE user_id IN (SELECT user_id FROM seed_target)
   AND description LIKE '[seed]%';


-- -----------------------------------------------------------------------------
-- 2. Goals
-- -----------------------------------------------------------------------------
-- Five active plus one achieved: more than three active is what makes the
-- "View all" control on the Progress screen appear.
INSERT INTO goals (user_id, grade_id, goal_description, is_achieved, achieved_at, target_date)
SELECT t.user_id, g.grade_id, v.descr, v.achieved,
       CASE WHEN v.achieved THEN now() - INTERVAL '21 days' END,
       CASE WHEN v.days_out IS NULL THEN NULL ELSE CURRENT_DATE + v.days_out END
  FROM (VALUES
        ('V4'::text, '[seed] Send a V4 outside on real rock'::text, false, 21::int),
        ('V5',       '[seed] First V5 — the red roof project',      false, 45),
        ('V5',       '[seed] Flash a V5 warm-up',                   false, 90),
        ('V6',       '[seed] Touch V6 by the end of the season',    false, 150),
        ('V4',       '[seed] Three V4s in one session',             false, NULL),
        ('V3',       '[seed] Send V3 consistently',                 true,  NULL)
       ) AS v(grade, descr, achieved, days_out)
  JOIN grades g ON g.grade_name = v.grade
 CROSS JOIN seed_target t;


-- -----------------------------------------------------------------------------
-- 3. Sessions, routes, climbs and tags
-- -----------------------------------------------------------------------------
-- One statement so the whole history lands or none of it does. The plan tables
-- read top-to-bottom as "oldest first"; day_offset is days before today, and
-- climbs find their session by matching it.
WITH session_plan(day_offset, gym, mins) AS (
  VALUES
    (73::int, 'The Hive'::text,    75::int),
    (66,      'The Hive',          80),
    (59,      'Cliffhanger',       90),
    (52,      'The Hive',          85),
    (45,      'Ground Up',        100),
    (38,      'The Hive',          95),
    (31,      'Cliffhanger',      110),
    (27,      'The Hive',          90),
    (20,      'The Hive',         105),
    (17,      'Ground Up',         95),
    (14,      'Cliffhanger',      120),
    (11,      'The Hive',         100),
    (6,       'The Hive',          90),
    (3,       'Ground Up',        115)
),
new_sessions AS (
  INSERT INTO sessions (user_id, visit_date, gym_name, duration_minutes)
  SELECT t.user_id, CURRENT_DATE - p.day_offset, p.gym, p.mins
    FROM session_plan p
   CROSS JOIN seed_target t
  RETURNING session_id, visit_date
),
-- Route names are unique across the seed: the inserts below correlate on them,
-- and a real gym reset renames everything anyway.
climb_plan(day_offset, route_name, grade, tries, sends, wall, holds, weaknesses, note) AS (
  VALUES
  -- ---- ten weeks ago: settling into V2/V3, overhangs already a problem -----
  (73::int, '[seed] Grey slab warm-up'::text,      'V2'::text, 1::int, 1::int, 'slab'::text,     ARRAY['jug']::text[],              '{}'::text[], NULL::text),
  (73, '[seed] Blue vertical ladder',              'V2', 1, 1, 'vertical', ARRAY['jug','crimp'],        '{}',                                     NULL),
  (73, '[seed] Green corner',                      'V3', 4, 1, 'dihedral', ARRAY['sidepull'],           ARRAY['Footwork'],                        'Kept cutting feet on the corner. Third try I finally trusted the smear.'),
  (73, '[seed] Orange overhang intro',             'V3', 6, 0, 'overhang', ARRAY['jug','sloper'],       ARRAY['Endurance','Core tension'],        'Pumped out before the last move every single time.'),

  (66, '[seed] Yellow slab traverse',              'V2', 1, 1, 'slab',     ARRAY['crimp'],              '{}',                                     NULL),
  (66, '[seed] Purple vertical crimps',            'V3', 3, 1, 'vertical', ARRAY['crimp'],              ARRAY['Finger strength'],                 NULL),
  (66, '[seed] Red roof intro',                    'V3', 7, 0, 'roof',     ARRAY['jug'],                ARRAY['Core tension'],                    'Body just swings off. No idea how to keep tension upside down.'),
  (66, '[seed] Black arete easy',                  'V2', 2, 1, 'arete',    ARRAY['pinch'],              '{}',                                     NULL),

  (59, '[seed] White slab balance',                'V3', 2, 1, 'slab',     ARRAY['sloper'],             '{}',                                     'Slab is starting to feel natural.'),
  (59, '[seed] Pink vertical reachy',              'V3', 3, 1, 'vertical', ARRAY['jug','pinch'],        '{}',                                     NULL),
  (59, '[seed] Teal overhang crimps',              'V4', 8, 0, 'overhang', ARRAY['crimp'],              ARRAY['Finger strength','Endurance'],     'Fingers gave out at the crux. Same story as last week.'),

  (52, '[seed] Green slab technical',              'V3', 1, 1, 'slab',     ARRAY['crimp'],              '{}',                                     'Flashed it. Feet are getting better.'),
  (52, '[seed] Blue vertical power',               'V4', 5, 1, 'vertical', ARRAY['pinch','crimp'],      ARRAY['Power / dynamic moves'],           'First V4! Took five goes but it went.'),
  (52, '[seed] Orange overhang long',              'V4', 9, 0, 'overhang', ARRAY['sloper','jug'],       ARRAY['Endurance','Core tension'],        NULL),
  (52, '[seed] Grey dihedral stem',                'V3', 2, 1, 'dihedral', ARRAY['sidepull'],           '{}',                                     NULL),

  -- ---- six weeks ago: V4 becoming repeatable ------------------------------
  (45, '[seed] Red slab microfeet',                'V4', 3, 1, 'slab',     ARRAY['crimp'],              ARRAY['Balance on slab'],                 NULL),
  (45, '[seed] Yellow vertical crimps',            'V4', 4, 1, 'vertical', ARRAY['crimp'],              ARRAY['Finger strength'],                 NULL),
  (45, '[seed] Purple overhang pinches',           'V4', 7, 1, 'overhang', ARRAY['pinch','sloper'],     ARRAY['Endurance'],                       'Finally got an overhang V4. Completely wrecked afterwards.'),
  (45, '[seed] Black roof project',                'V5',10, 0, 'roof',     ARRAY['jug','pocket'],       ARRAY['Core tension','Power / dynamic moves'], 'The roof is a different sport. Cannot even link the first two moves.'),

  (38, '[seed] White vertical flow',               'V3', 1, 1, 'vertical', ARRAY['jug'],                '{}',                                     NULL),
  (38, '[seed] Teal slab delicate',                'V4', 2, 1, 'slab',     ARRAY['sloper'],             '{}',                                     'Flashed the start, one slip near the top.'),
  (38, '[seed] Pink overhang burly',               'V4', 8, 1, 'overhang', ARRAY['jug','undercling'],   ARRAY['Endurance'],                       NULL),
  (38, '[seed] Green arete balance',               'V4', 3, 1, 'arete',    ARRAY['pinch','sidepull'],   '{}',                                     NULL),

  (31, '[seed] Blue slab quick',                   'V3', 1, 1, 'slab',     ARRAY['crimp'],              '{}',                                     NULL),
  (31, '[seed] Orange vertical crimps hard',       'V5', 6, 0, 'vertical', ARRAY['crimp'],              ARRAY['Finger strength'],                 'V5 crimps are a wall right now. Cannot hold the small edges long enough.'),
  (31, '[seed] Red overhang steep',                'V4', 6, 1, 'overhang', ARRAY['sloper'],             ARRAY['Endurance'],                       NULL),
  (31, '[seed] Grey dihedral tricky',              'V4', 4, 1, 'dihedral', ARRAY['sidepull','pinch'],   ARRAY['Reading the beta'],                'Spent ages figuring out the sequence. Once I saw it, it went first go.'),
  (31, '[seed] Yellow roof intro two',             'V4', 9, 0, 'roof',     ARRAY['jug'],                ARRAY['Core tension'],                    NULL),

  (27, '[seed] Purple slab flash',                 'V4', 1, 1, 'slab',     ARRAY['crimp','sloper'],     '{}',                                     'Flashed a V4 on slab. That would have been unthinkable two months ago.'),
  (27, '[seed] Teal vertical steady',              'V4', 2, 1, 'vertical', ARRAY['jug','crimp'],        '{}',                                     NULL),
  (27, '[seed] Black overhang endurance',          'V4',10, 1, 'overhang', ARRAY['jug','sloper'],       ARRAY['Endurance'],                       'Ten goes. Sent it completely gassed.'),

  -- ---- last three weeks: V4 solid, V5 starting to fall --------------------
  (20, '[seed] White slab flash two',              'V4', 1, 1, 'slab',     ARRAY['crimp'],              '{}',                                     NULL),
  (20, '[seed] Green vertical crimps two',         'V4', 2, 1, 'vertical', ARRAY['crimp'],              '{}',                                     NULL),
  (20, '[seed] Pink overhang project',             'V5',12, 0, 'overhang', ARRAY['crimp','pinch'],      ARRAY['Finger strength','Endurance'],     'The project. Getting to the last move now, which is progress.'),
  (20, '[seed] Blue arete quick',                  'V3', 1, 1, 'arete',    ARRAY['pinch'],              '{}',                                     NULL),
  (20, '[seed] Orange dihedral stem two',          'V4', 3, 1, 'dihedral', ARRAY['sidepull'],           '{}',                                     NULL),

  (17, '[seed] Red slab technical two',            'V5', 4, 1, 'slab',     ARRAY['crimp','sloper'],     ARRAY['Balance on slab'],                 'FIRST V5. On slab, which says everything about where my strengths are.'),
  (17, '[seed] Yellow vertical long',              'V4', 2, 1, 'vertical', ARRAY['jug','crimp'],        '{}',                                     NULL),
  (17, '[seed] Grey overhang burly two',           'V5', 9, 0, 'overhang', ARRAY['sloper','undercling'],ARRAY['Endurance','Core tension'],        NULL),

  (14, '[seed] Teal slab flash',                   'V4', 1, 1, 'slab',     ARRAY['sloper'],             '{}',                                     NULL),
  (14, '[seed] Purple vertical crimps three',      'V5', 5, 1, 'vertical', ARRAY['crimp'],              ARRAY['Finger strength'],                 'Second V5. The hangboard is doing something after all.'),
  (14, '[seed] Black overhang steep two',          'V5',11, 0, 'overhang', ARRAY['crimp','pinch'],      ARRAY['Finger strength','Endurance'],     'Still cannot link the top of the overhang V5s. Always the same failure.'),
  (14, '[seed] White arete dynamic',               'V4', 4, 1, 'arete',    ARRAY['pinch'],              ARRAY['Power / dynamic moves'],           NULL),
  (14, '[seed] Green roof tension',                'V4', 7, 1, 'roof',     ARRAY['jug','pocket'],       ARRAY['Core tension'],                    'First roof send. Core work is paying off.'),

  (11, '[seed] Blue slab flash three',             'V4', 1, 1, 'slab',     ARRAY['crimp'],              '{}',                                     NULL),
  (11, '[seed] Orange vertical steady two',        'V4', 2, 1, 'vertical', ARRAY['jug'],                '{}',                                     NULL),
  (11, '[seed] Pink overhang crimps three',        'V5',10, 0, 'overhang', ARRAY['crimp'],              ARRAY['Finger strength'],                 NULL),
  (11, '[seed] Red dihedral quick',                'V4', 2, 1, 'dihedral', ARRAY['sidepull','pinch'],   '{}',                                     NULL),

  (6,  '[seed] Grey slab flash four',              'V4', 1, 1, 'slab',     ARRAY['sloper'],             '{}',                                     'Slab V4s are warm-ups now.'),
  (6,  '[seed] Yellow vertical crimps four',       'V5', 6, 1, 'vertical', ARRAY['crimp'],              ARRAY['Finger strength'],                 'Third V5.'),
  (6,  '[seed] Teal overhang project two',         'V5',11, 0, 'overhang', ARRAY['crimp','sloper'],     ARRAY['Endurance','Finger strength'],     NULL),
  (6,  '[seed] Purple arete balance two',          'V4', 2, 1, 'arete',    ARRAY['pinch'],              '{}',                                     NULL),

  (3,  '[seed] White slab warm-up two',            'V3', 1, 1, 'slab',     ARRAY['jug'],                '{}',                                     NULL),
  (3,  '[seed] Black vertical crimps five',        'V5', 4, 1, 'vertical', ARRAY['crimp'],              '{}',                                     'Fourth V5 and it only took four tries. Something clicked.'),
  (3,  '[seed] Green overhang project three',      'V5',13, 1, 'overhang', ARRAY['crimp','pinch'],      ARRAY['Endurance'],                       'GOT IT. Thirteen tries across three sessions but the overhang V5 finally went.'),
  (3,  '[seed] Orange roof tension two',           'V4', 5, 1, 'roof',     ARRAY['jug','pocket'],       ARRAY['Core tension'],                    NULL),
  (3,  '[seed] Red slab project',                  'V6', 8, 0, 'slab',     ARRAY['crimp'],              ARRAY['Finger strength','Balance on slab'],'First proper V6 attempt. Two moves in, but it feels possible.')
),
new_routes AS (
  INSERT INTO routes (grade_id, route_name)
  SELECT g.grade_id, c.route_name
    FROM climb_plan c
    JOIN grades g ON g.grade_name = c.grade
  RETURNING route_id, route_name
),
new_attempts AS (
  INSERT INTO attempts (session_id, route_id, attempt_count, send_count, note)
  SELECT s.session_id, r.route_id, c.tries, c.sends, c.note
    FROM climb_plan c
    JOIN new_routes   r ON r.route_name = c.route_name
    JOIN new_sessions s ON s.visit_date = CURRENT_DATE - c.day_offset
  RETURNING attempt_id, route_id
),
tag_walls AS (
  INSERT INTO route_wall_types (route_id, wall_type_id)
  SELECT r.route_id, w.wall_type_id
    FROM climb_plan c
    JOIN new_routes r ON r.route_name = c.route_name
    JOIN wall_types w ON w.code = c.wall
  RETURNING 1
),
tag_holds AS (
  INSERT INTO route_hold_types (route_id, hold_type_id)
  SELECT r.route_id, h.hold_type_id
    FROM climb_plan c
    JOIN new_routes r ON r.route_name = c.route_name
    CROSS JOIN LATERAL unnest(c.holds) AS picked(code)
    JOIN hold_types h ON h.code = picked.code
  RETURNING 1
),
tag_weaknesses AS (
  INSERT INTO attempt_weaknesses (attempt_id, weakness_type_id)
  SELECT a.attempt_id, w.weakness_type_id
    FROM climb_plan c
    JOIN new_routes   r ON r.route_name = c.route_name
    JOIN new_attempts a ON a.route_id = r.route_id
    CROSS JOIN LATERAL unnest(c.weaknesses) AS picked(label)
    -- Presets only (user_id IS NULL): a climber's own labels are created
    -- through the app, not here.
    JOIN weakness_types w ON w.label = picked.label AND w.user_id IS NULL
  RETURNING 1
)
SELECT count(*) FROM new_attempts;


-- -----------------------------------------------------------------------------
-- 4. Injuries
-- -----------------------------------------------------------------------------
-- One healed (history, and proof the status flow works) and one still
-- recovering. The open one drives the dashboard banner and makes the AI
-- training plan route around the elbow — which is the whole point of the
-- feature and the most convincing thing to demo.
WITH new_injuries AS (
  INSERT INTO injuries (user_id, body_part_id, side, occurred_on, status, severity, description, resolved_on)
  SELECT t.user_id, bp.body_part_id, v.side, CURRENT_DATE - v.days_ago,
         v.status, v.severity, v.descr,
         CASE WHEN v.resolved_days_ago IS NULL
              THEN NULL ELSE CURRENT_DATE - v.resolved_days_ago END
    FROM (VALUES
          ('finger'::text, 'right'::text, 64::int, 'healed'::text,     3::int,
           '[seed] Tweaked the A2 pulley on a small crimp. Rested two weeks.'::text, 30::int),
          ('elbow',  'left',  18, 'recovering', 2,
           '[seed] Aching on the inside of the elbow after a big overhang session.', NULL)
         ) AS v(part, side, days_ago, status, severity, descr, resolved_days_ago)
    JOIN body_parts bp ON bp.code = v.part
   CROSS JOIN seed_target t
  RETURNING injury_id, occurred_on, status
)
-- Daily check-ins for the elbow, trending down from 6 to 2 over two weeks with
-- a realistic bump partway: a chart that only ever improves reads as fake, and
-- the bump is what makes the trend line worth looking at.
INSERT INTO injury_logs (injury_id, logged_on, pain_level, note)
SELECT i.injury_id, CURRENT_DATE - v.days_ago, v.pain, v.note
  FROM (VALUES
        (16::int, 6::int, 'Sore just gripping a coffee cup.'::text),
        (15, 6, NULL),
        (14, 5, 'Rested completely.'),
        (12, 5, NULL),
        (11, 4, 'Easy jugs only, felt okay.'),
        (9,  4, NULL),
        (8,  5, 'Overdid it yesterday — went back up a bit.'),
        (7,  4, NULL),
        (5,  3, 'Back to slab and vertical only.'),
        (4,  3, NULL),
        (2,  2, 'Barely notice it now. Still avoiding overhangs.'),
        (1,  2, NULL)
       ) AS v(days_ago, pain, note)
 CROSS JOIN new_injuries i
 WHERE i.status = 'recovering';


-- -----------------------------------------------------------------------------
-- 5. Report what landed
-- -----------------------------------------------------------------------------
-- RAISE NOTICE rather than a SELECT: `pnpm db:seed` forwards notices to the
-- console but discards result sets. Naming the account matters — seeding the
-- wrong one is otherwise completely silent.
DO $$
DECLARE
  t          record;
  sessions_n int;
  climbs     int;
  tries      int;
  sends      int;
  flashes    int;
  goals_open int;
  injuries_n int;
BEGIN
  SELECT * INTO t FROM seed_target;

  SELECT count(DISTINCT s.session_id),
         count(a.attempt_id),
         COALESCE(sum(a.attempt_count), 0),
         COALESCE(sum(a.send_count), 0),
         count(*) FILTER (WHERE a.attempt_count = 1 AND a.send_count = 1)
    INTO sessions_n, climbs, tries, sends, flashes
    FROM sessions s
    LEFT JOIN attempts a ON a.session_id = s.session_id
   WHERE s.user_id = t.user_id;

  SELECT count(*) INTO goals_open
    FROM goals WHERE user_id = t.user_id AND NOT is_achieved;
  SELECT count(*) INTO injuries_n
    FROM injuries WHERE user_id = t.user_id;

  RAISE NOTICE 'seeded onto % (user_id %)', t.email, t.user_id;
  RAISE NOTICE '  % sessions, % routes, % tries, % sends, % flashes',
    sessions_n, climbs, tries, sends, flashes;
  RAISE NOTICE '  % active goals, % injuries', goals_open, injuries_n;
  RAISE NOTICE '  sign in as % to see it', t.email;
END $$;

DROP TABLE IF EXISTS seed_config;
DROP TABLE IF EXISTS seed_target;
