# Manual setup

Everything else is in the repo. These things cannot be done from code — they
need someone with access to the Supabase project.

Referenced from `db/migrations/0008_media.sql`, which is already applied and
therefore immutable, so this file needs to stay where it is.

---

## 1. Run the migrations

Migrations `0004` – `0010` add the session duration column, the wall/hold/
weakness tag tables, the one-row-per-route change to `attempts`, the media
table, the AI-report note columns, and the injury tables.

```bash
cd server
pnpm db:status     # lists applied / pending
pnpm db:migrate
```

**Status: already applied to the local `climb_app` database.** Any other
database — a teammate's, or a deployed one — still needs this. The runner is
forward-only and checksummed, so running it twice is safe.

### What `0007` did to existing data

It changed what an `attempts` row means: it used to be one try, it is now one
route with a try count and a send count. Existing rows were carried forward as
*one try* each. The local database had zero `attempts` rows when it ran, so
nothing was actually converted.

---

## 2. Create the Storage bucket — required for photos and videos

The app uploads files from the browser straight to Supabase Storage and only
sends the resulting object key to our API. That needs one private bucket and
four policies. Until this is done, photo/video upload is the only thing that
fails; every other feature is unaffected.

Run this in the Supabase dashboard → **SQL Editor**:

```sql
-- The bucket. Private: files are served through short-lived signed URLs, so a
-- copied link expires instead of being a permanent public one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'climb-media',
  'climb-media',
  false,
  52428800,  -- 50 MB, matching the server's video ceiling
  array[
    'image/jpeg','image/png','image/webp','image/heic',
    'video/mp4','video/quicktime','video/webm'
  ]
)
on conflict (id) do nothing;

-- Policies. Every object key starts with the uploader's auth user id, so
-- "the first path segment is you" is the whole authorization rule.
create policy "climb-media: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'climb-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "climb-media: upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'climb-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "climb-media: update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'climb-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "climb-media: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'climb-media' and (storage.foldername(name))[1] = auth.uid()::text);
```

Re-running the `create policy` statements errors with "policy already exists";
that is harmless, and the `insert` is guarded.

### Why this does not conflict with migration 0002

`0002_lock_down_data_api.sql` locks the app's own tables away from the Supabase
Data API (PostgREST). Storage is a separate subsystem with its own policies on
`storage.objects`, so it is unaffected. Do **not** apply the same deny-all
treatment to `storage.objects` — the browser needs exactly this access.

### One thing this design does not handle

Deleting a session deletes its `media` rows (foreign-key cascade) but not the
files in the bucket, because the server holds no service-role key and cannot
reach into Storage. Orphaned objects still count against the quota. For a
project at this scale that is fine; if it ever matters, a scheduled job that
diffs bucket contents against `media.storage_path` is the fix.

---

## 3. Create the demo account

The seed attaches everything to one demo account, and that account has to exist
in **Supabase Auth** before the seed runs. SQL cannot create it: authentication
is delegated, so a `users` row on its own is half an account — without a
matching Auth user nobody can sign in and the data never appears in the app.

Do this once:

1. Start the app and go to `/auth` → **Create account**
2. Sign up as `demo@climblog.app` (first name `Demo`), with a password the team
   will actually remember on demo day
3. Confirm the email
4. **Sign in once.** The `users` row is provisioned on the first authenticated
   request (`middleware/auth.ts`), so it does not exist until you do

If that address cannot receive mail, use a plus-address on an inbox you own —
Gmail delivers `you+demo@gmail.com` to `you@gmail.com` — and put that address
in `db/seed.sql` instead. Alternatively create the user from the Supabase
dashboard (Authentication → Users → Add user, with "Auto Confirm User" on), then
still sign in once through the app to trigger step 4.

---

## 4. Load the demo data

`db/seed.sql` writes fourteen sessions over ten weeks, tagged and with notes,
plus goals and two injuries — enough for every screen and the AI coach to have
something real to work with.

The account it targets is one line near the top:

```sql
INSERT INTO seed_config VALUES ('demo@climblog.app');   -- <<< CHANGE ME
```

```bash
cd server
pnpm db:seed       # refuses non-local hosts unless --force
```

It refuses to run rather than seeding the wrong place: an unknown email fails
with the list of accounts that do exist, and pointing it at the old placeholder
account fails with an explanation. On success it prints what it wrote and which
account it wrote it to.

Safe to re-run: the seed clears its own previous output first. It matches on
the three demo gym names (`The Hive`, `Cliffhanger`, `Ground Up`) and on a
`[seed]` prefix in route names, goal descriptions and injury descriptions, so
anything logged by hand survives.

Dates are relative to `CURRENT_DATE`, so the data stays current whenever it
runs. `performances` and `trainings` are deliberately not seeded — generate one
live from the AI Coach screen.

It also deletes the legacy `demo@climb.app` row (the fixed placeholder UUID the
previous version of the seed created). That account could never be signed in
as, so it only ever caused confusion.

---

## 5. Environment variables — nothing new

| Variable | Where | Needed for |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | frontend | auth, and Storage upload uses the same client |
| `DATABASE_URL` | server | migrations and every query |
| `OPENAI_API_KEY` | server | AI coach — optional; the endpoints answer 503 without it |

---

## 6. Tag vocabularies — optional

Seeded by migrations `0005`, `0006` and `0010`:

- **Wall:** Slab, Vertical, Overhang, Roof, Arête, Dihedral
- **Holds:** Jug, Crimp, Sloper, Pinch, Pocket, Sidepull, Undercling, Volume
- **Weaknesses:** Finger strength, Grip / lock-off, Footwork, Core tension,
  Power / dynamic moves, Endurance, Reading the beta, Fear of falling,
  Flexibility, Balance on slab
- **Body parts:** Finger / pulley, Wrist, Elbow, Shoulder, Back, Hip, Knee,
  Ankle, Other

These migrations are already applied, so changing the lists now means adding a
new migration — editing an applied file fails the checksum check on purpose.

Climbers can add their own weakness labels from the log form regardless, so
that list is the least important one to get right.

---

## Verify

```bash
cd server && pnpm db:status && pnpm dev
cd frontend && pnpm dev
```

1. **Log Session** — Wall type and Hold type buttons, a weakness dropdown, and
   Tries / Sends counters. Log a route with a photo attached.
2. **Progress** — with more than three active goals a "View all" button
   appears; a "Success Rate by Wall Angle" chart appears once routes are
   tagged.
3. **AI Coach** — generate an analysis. Two lines up top, a grade chart, then
   pin it and write a note.
4. **Injuries** — record one, check in, confirm the dashboard banner appears.
   Generate a training plan and confirm it reports being adjusted if it dropped
   a drill.

If photo upload fails with a permissions error, step 2 did not take.
