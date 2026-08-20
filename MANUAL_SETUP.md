# Manual setup

日本語版: [`MANUAL_SETUP.ja.md`](MANUAL_SETUP.ja.md) — same content; keep both in
step when this changes.

Everything else is in the repo. These things cannot be done from code — they
need someone with access to the dashboards.

Referenced from `db/migrations/0008_media.sql`, which is already applied and
therefore immutable, so this file needs to stay where it is.

**Going to production for the first time?** Sections 1–6 are the local /
development setup and are already done. The production checklist is
[section 7 onward](#7-production-going-live), and the one thing worth starting
before anything else is the Postmark account review — it is a human approval
outside our control, and no real signup can be tested until it clears.

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

### This bucket is being retired

Media moved to Cloudflare R2 — see [section 9](#9-cloudflare-r2--photo-and-video-storage).
Supabase Storage gives the whole project one free gigabyte while the app offers
each climber 200 MB of it, so five climbers could exhaust what fifty are meant
to share. R2's free tier is 10 GB and charges nothing for downloads, which is
the half a video app actually spends.

Keep this bucket and its policies until `scripts/migrate-media-to-r2.ts` has
copied everything across and the new path has run in production for a week.
Then empty it.

It also had a flaw R2 fixes: deleting a session deleted its `media` rows but
not the files, because the server held no service-role key and could not reach
into Storage. Those orphans are still in there. The migration script copies
them along with everything else — reconciling them is a separate job, and
having them in one place first makes it easier.

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

## 5. Environment variables — local development

| Variable | Where | Needed for |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | frontend | auth |
| `VITE_API_URL` | frontend | the API base URL |
| `DATABASE_URL` | server | migrations and every query |
| `OPENAI_API_KEY` | server | AI coach — optional; the endpoints answer 503 without it |
| `R2_*` (four) | server | photo/video storage — optional; the media endpoints answer 503 without them |

Both `.env.example` files document every variable in full. The production set
is in [section 7](#7-production-going-live).

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

## 7. Production — going live

Everything from here is production only, and none of it is in the repo. Rough
order: start Postmark first because it waits on a human, do DNS next because
everything else verifies against it, then the two Vercel projects.

**Placeholders below:** `<domain>` is the domain you own (Cloudflare is the
registrar and the DNS provider). The app lives at `app.<domain>`; the apex is
left free for a landing page later. Mail sends from `noreply@<domain>`.

### 7.1 Postmark — start this first

Auth emails cannot go through Supabase's built-in sender: it is capped at
**two messages an hour**, which is not a limit you can onboard anyone through.

1. Create a Postmark account and add `<domain>` as a sending domain.
2. Add the DKIM and Return-Path records it gives you — see [8.2](#82-mail-records).
3. **Request account approval immediately.** Until it clears, Postmark only
   delivers to addresses on domains you have verified yourself, so a Gmail test
   signup silently fails. Review takes under 24 hours on weekdays.
4. Server → Default Transactional Stream → API Tokens → copy the **Server API
   Token**. It is used as both the SMTP username and the password.
5. Set a monthly volume alert at **80**. The free plan is 100 emails a month
   with no overage — it stops delivering rather than billing. Around 50 signups
   plus password resets fits, but the launch month is the tight one. Basic is
   $15/month for 10,000 if you outgrow it.

### 7.2 Supabase Auth

- **SMTP Settings** → enable custom SMTP: host `smtp.postmarkapp.com`, port
  `587`, sender `noreply@<domain>`, sender name `ClimbLog AI`, and the Server
  API Token as **both** username and password.
- **Rate Limits** → enabling custom SMTP moves the default from 2/hour to
  30/hour. **Leave it at 30.** It is plenty for this many climbers and it
  doubles as the guard rail on Postmark's 100-a-month free cap.
- **URL Configuration** → Site URL `https://app.<domain>`; redirect allow list
  `https://app.<domain>/**` and `http://localhost:5173/**`.
- **Email Templates** → these still say "Supabase". Worth branding before
  anyone outside the team signs up.
- **Passkeys** (Authentication → Passkeys) → enable the beta, and set the
  **RP ID to `<domain>`, not `app.<domain>`**. A passkey registered against the
  parent works on any subdomain; one bound to `app.` is locked there forever.

> Auth emails stay in one language. Supabase templates are per-project, so the
> app's Japanese does not reach them — localising those would need a Send Email
> auth hook calling the Postmark API directly. Out of scope, worth knowing.

---

## 8. Cloudflare DNS

All in the `<domain>` zone. Three of these have a trap attached.

### 8.1 The app

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| CNAME | `app` | `cname.vercel-dns.com` | **DNS only (grey)** |

> **Grey cloud, not orange.** Proxying puts Cloudflare's CDN and TLS in front
> of Vercel's own, which breaks Vercel's certificate issuance and double-caches
> every asset.

### 8.2 Mail records

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| TXT | (from Postmark, e.g. `20260819._domainkey`) | the DKIM value Postmark shows | n/a |
| CNAME | `pm-bounces` (use the exact host Postmark shows) | `pm.mtasv.net` | **DNS only (grey)** |
| TXT | `@` | `v=spf1 include:spf.mtasv.net ~all` | n/a |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@<domain>` | n/a |

Two more traps:

- The Return-Path CNAME must also be **grey-clouded**, and *Flatten all CNAMEs*
  (Rules → Settings) must be **off**. Cloudflare proxies HTTP only, so a
  proxied or flattened bounce record resolves to Cloudflare IPs and Postmark's
  verification fails.
- **Only one SPF TXT record is legal per domain.** If you ever turn on
  Cloudflare Email Routing for inbound mail, merge rather than add a second:
  `v=spf1 include:_spf.mx.cloudflare.net include:spf.mtasv.net ~all`.

Start DMARC at `p=none` — it reports without rejecting, so a misconfiguration
shows up in the reports instead of in undelivered signups.

---

## 9. Cloudflare R2 — photo and video storage

1. Create buckets `climb-media` and `climb-media-dev` (the dev one keeps local
   experiments out of production).
2. Create an R2 API token scoped to **Object Read & Write** on those buckets
   only. It gives you `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`; the
   account id is the hex string in the S3 endpoint.
3. Set bucket **CORS** — this is the one that fails first if forgotten, because
   the browser PUTs directly to R2:
   ```json
   [
     {
       "AllowedOrigins": ["https://app.<domain>", "http://localhost:5173"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type", "content-length"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. Copy the existing files across, once, from a machine with both sets of
   credentials:
   ```bash
   cd server
   SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/migrate-media-to-r2.ts          # dry run
   SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/migrate-media-to-r2.ts --commit
   ```
   Keys are preserved, so no stored path has to be rewritten. It never deletes
   from Supabase — empty that bucket by hand after a week of the new path
   running.

---

## 10. Vercel — two projects

### API project

- **Root Directory** `server/`. Install `pnpm install --frozen-lockfile`.
  The build runs from `package.json`'s `vercel-build` script; nothing to set.
- Confirm **Fluid Compute** is on (default for new projects). It is what makes
  cold starts a second or two rather than the 30–60 seconds Render's free tier
  took.
- Environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase **transaction pooler**, port 6543 |
| `MIGRATE_DATABASE_URL` | Supabase **session** connection, port 5432 — **Production only** |
| `DATABASE_CA_CERT` | the PEM text from `server/certs/prod-ca-2021.crt` |
| `SUPABASE_URL` | the project URL |
| `OPENAI_API_KEY` | from platform.openai.com |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | from section 9 |
| `SENTRY_DSN` | from section 11 |
| `CORS_ORIGIN` | `https://app.<domain>` |
| `NODE_ENV` | `production` |

> **`MIGRATE_DATABASE_URL` on Production only, deliberately.** Its presence is
> what decides whether a deployment migrates. Set on Preview too, every preview
> branch would migrate the production database; unset on Production, the schema
> never moves. Migrations need a direct session connection because the advisory
> lock that serialises them cannot survive the transaction pooler.

### Frontend project

- Root `frontend/`, and assign the domain **`app.<domain>`** to it.
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_API_URL` (the API project's URL plus `/api/v1`), `VITE_SENTRY_DSN`.
- The build **fails** if any of the first three is missing, rather than
  shipping a client pointed at localhost. That is intentional.

The API project needs no custom domain — it is only ever reached by the browser
through `VITE_API_URL`, and `CORS_ORIGIN` is what lets that through.

---

## 11. Sentry

Two projects — one **React**, one **Node** — and their DSNs into the two Vercel
projects above. Both integrations are no-ops without a DSN and outside
production, so there is nothing to turn off for local work.

---

## 12. After the first production deploy

1. Watch it for a day, then **delete the Render service** and its deploy-hook
   secret. The workflow that called it is already gone from the repo.
2. Empty the Supabase Storage bucket once the R2 copy has been running a week
   (section 9), and drop the four `climb-media` policies from section 2.
3. Confirm the mail path end to end:
   - `dig CNAME pm-bounces.<domain>` must answer `pm.mtasv.net`, **not** a
     Cloudflare IP — that is the proof the record is unproxied.
   - Sign up with a **Gmail** address. Success means Postmark approval landed.
   - Run one message through [mail-tester.com](https://www.mail-tester.com) and
     confirm SPF, DKIM and DMARC all pass.
4. Confirm a photo upload works from the production origin. A CORS failure here
   is the most likely thing to be wrong, and it looks like a silent upload
   failure rather than an error.

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
