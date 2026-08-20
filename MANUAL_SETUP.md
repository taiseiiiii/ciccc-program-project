# Manual setup — going to production

日本語版: [`MANUAL_SETUP.ja.md`](MANUAL_SETUP.ja.md) — same content; keep both in
step when this changes.

Everything else is in the repo. These things cannot be done from code — they
need someone with access to the dashboards.

**This file covers the production release only.** The local / development
setup — the early migrations, the Supabase Storage bucket, the demo account,
the seed data, the tag vocabularies — is done, and has been removed from here.
Git history has it if you need it.

**Placeholders:** `<domain>` is the domain already registered at Cloudflare.
The app lives at `app.<domain>`; the apex is left free for a landing page later.

> **On sweeping media files** (referenced from `db/migrations/0008_media.sql`)
> Deleting a session cascades to its `media` rows, but the files themselves
> needed a separate sweep: the old server held no service-role key and could
> not reach into Storage. Why, and what replaced it, is in
> [section 4](#4-cloudflare-r2).

---

## Order of work

These depend on each other. Go in this order.

1. **Request Postmark account approval.** It is a human review and nothing you
   do shortens it (under 24 hours on weekdays). No signup with a real address
   can be tested until it clears, so **file it first and let it run in
   parallel** with everything else.
2. **DNS** — the DKIM and Return-Path values come from Postmark, so this
   follows step 1.
3. **R2 and Sentry** — nothing else depends on them; do these while waiting.
4. **The Vercel API project** — the frontend's `VITE_API_URL` needs the API's
   URL, so this one comes first.
5. **The Vercel frontend project** — the build **fails** if a required
   environment variable is missing (deliberately). Set them all before the
   first deploy.
6. **Supabase production settings** — last, because SMTP needs the Postmark
   token and URL Configuration needs `app.<domain>`.

---

## 1. Account structure

Cloudflare, Supabase and Vercel are all on a personal account today.
**No migration is needed**, but the project should not be hostage to one
personal Google account, so set up one shared contact address.

### 1.1 Addresses on the domain

Use Cloudflare Email Routing (free) to forward these to an inbox you own, and
register them with the services rather than a Gmail address.

| Address | Used for |
| --- | --- |
| `admin@<domain>` | signing up to every service |
| `support@<domain>` | the contact address shown in the app and in emails |
| `dmarc@<domain>` | DMARC aggregate reports |

`noreply@<domain>` is send-only through Postmark and needs no forwarding rule.

- **Email Routing forwards; it cannot send.** Receiving signup and confirmation
  mail is all it needs to do here, but replying to something that arrives at
  `support@` means setting up Gmail's "Send mail as" separately.
- **Turning on Email Routing makes Cloudflare add MX and SPF records for you.**
  Only one SPF record is legal per domain, so merge it with Postmark's — see
  [3.2](#32-mail-records).
- Postmark's review is a person deciding whether you are a legitimate sender.
  Applying from a free Gmail address to send as `<domain>` invites questions, so
  **set this up before signing up to Postmark.**

### 1.2 Naming the Google account

`climblog.ai@gmail.com` is not a good choice, for three reasons.

- **Gmail ignores dots.** `climblog.ai@gmail.com` and `climblogai@gmail.com`
  are the same mailbox. The dot carries no meaning and distinguishes nothing.
- `.ai` inside a local part reads as part of a domain, so it will be mistyped
  every time it is spoken aloud or pasted into a ticket.
- It pins a product name and a TLD into something that can never be renamed.

And per 1.1, services get `admin@<domain>` — so **the Gmail address is never
shown anywhere.** It is only the recovery identity, which means a boring name
is the right name.

Candidates: `climblogapp@gmail.com`, `climblog.ops@gmail.com`,
`climblogteam@gmail.com`.

Once it exists, **turn on two-factor auth and save the recovery codes first.**
That account becomes the recovery path for the whole production stack.

### 1.3 Sharing the accounts you already have

An invitation, not a migration. Same property, far less risk.

| Service | Do this |
| --- | --- |
| Cloudflare | invite `admin@<domain>` to Members as Super Administrator |
| Supabase | invite it to the Organization as Owner |
| Vercel | after launch. Project Transfer exists, so this stays cheap |
| Postmark / Sentry | not created yet — create them as `admin@<domain>` |

**Do not transfer the domain.** A recently registered one can still be inside
ICANN's 60-day transfer lock, and moving DNS authority days before a launch is
not a trade worth making.

**Never recreate the Supabase project.** `users.id` references the Supabase
Auth UID. Recreating drops `auth.users`, breaking the link between every
climber and their logs, and the project ref changes so `VITE_SUPABASE_URL`
becomes a different value. If it ever has to move, use Transfer Project between
organizations (check the dashboard for what the Free plan allows).

> If Vercel and Supabase were created via **GitHub login**, the real owner is
> the GitHub account, not a Gmail one — in which case a GitHub Organization
> (free) is the move that matters. This repo is also coursework, so check the
> submission requirements before touching it.

---

## 2. Postmark

**Start this first.**

Auth emails cannot go through Supabase's built-in sender: it is capped at
**two messages an hour**, which is not a limit you can onboard anyone through.

1. Create a Postmark account as `admin@<domain>` and add `<domain>` as a
   sending domain.
2. Add the DKIM and Return-Path records it gives you — see
   [3.2](#32-mail-records).
3. **Request account approval immediately.** Until it clears, Postmark only
   delivers to addresses on domains you have verified yourself, so a Gmail test
   signup silently fails. Review takes under 24 hours on weekdays.
4. Server → Default Transactional Stream → API Tokens → copy the **Server API
   Token**. It is used as both the SMTP username and the password.
5. Set a monthly volume alert at **80**. The free plan is 100 emails a month
   with no overage — it stops delivering rather than billing. Around 50 signups
   plus password resets fits, but the launch month is the tight one. Basic is
   $15/month for 10,000 if you outgrow it.

> **You can test while the review is pending.** Delivery to your own verified
> domain works before approval, so a `test@<domain>` address — forwarded to
> your inbox by 1.1 — gets you signup → confirmation mail → link landing, end
> to end. Approval only gates delivery to **outside** addresses like Gmail.

---

## 3. Cloudflare DNS

All in the `<domain>` zone. Three of these have a trap attached.

### 3.1 The app

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| CNAME | `app` | `cname.vercel-dns.com` | **DNS only (grey)** |

> **Grey cloud, not orange.** Proxying puts Cloudflare's CDN and TLS in front
> of Vercel's own, which breaks Vercel's certificate issuance and double-caches
> every asset.

### 3.2 Mail records

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
- **Only one SPF TXT record is legal per domain.** Email Routing from
  [1.1](#11-addresses-on-the-domain) adds one automatically, so merge rather
  than add a second:

  ```
  v=spf1 include:_spf.mx.cloudflare.net include:spf.mtasv.net ~all
  ```

Start DMARC at `p=none` — it reports without rejecting, so a misconfiguration
shows up in the reports instead of in undelivered signups.

---

## 4. Cloudflare R2

Where photos and videos live. Supabase Storage gives the whole project one free
gigabyte while the app offers each climber 200 MB of it, so five climbers could
exhaust what fifty are meant to share. R2's free tier is 10 GB and charges
nothing for downloads, which is the half a video app actually spends.

R2 also fixes a flaw. Deleting a session used to delete its `media` rows but
not the files, because the server held no service-role key and could not reach
into Storage. With R2 the server holds the credentials, so the file goes the
same way the row does. The existing orphans are still on the Supabase side; the
migration script below copies them along with everything else.

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
   from Supabase — that is [section 9](#9-cleanup).

---

## 5. Supabase

Only the settings that change for production. The project itself already exists
and stays as it is.

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

> **Passkeys cannot be tested locally.** WebAuthn requires the RP ID to be the
> origin's own domain or a registrable parent of it. `localhost` is not a
> subdomain of `<domain>`, so the moment the RP ID is the production domain the
> browser rejects enrollment from localhost — and from `*.vercel.app` preview
> URLs too. Expect to verify this **only on `https://app.<domain>`**.

> **Auth emails stay in one language.** Supabase templates are per-project, so
> the app's Japanese does not reach them — localising those would need a Send
> Email auth hook calling the Postmark API directly. Out of scope, worth
> knowing.

---

## 6. Vercel

Two projects. **Create the API one first** — the frontend's `VITE_API_URL`
needs its URL.

### 6.1 API project

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
| `DATABASE_CA_CERT` | the PEM text from `server/certs/prod-ca-2021.crt` (Vercel accepts multi-line values as they are) |
| `SUPABASE_URL` | the project URL |
| `OPENAI_API_KEY` | from platform.openai.com — see [section 7](#7-sentry-and-openai) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | from [section 4](#4-cloudflare-r2) |
| `SENTRY_DSN` | from [section 7](#7-sentry-and-openai) |
| `CORS_ORIGIN` | `https://app.<domain>` |
| `NODE_ENV` | `production` |

> **`MIGRATE_DATABASE_URL` on Production only, deliberately.** Its presence is
> what decides whether a deployment migrates. Set on Preview too, every preview
> branch would migrate the production database; unset on Production, the schema
> never moves. Migrations need a direct session connection because the advisory
> lock that serialises them cannot survive the transaction pooler.

The database password is the one chosen when the project was created, and
invited members cannot see it. Reset it from Database settings if it is lost —
it is not the publishable / anon key.

The API project needs no custom domain — it is only ever reached by the browser
through `VITE_API_URL`, and `CORS_ORIGIN` is what lets that through.

### 6.2 Frontend project

- Root `frontend/`, and assign the domain **`app.<domain>`** to it.
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_API_URL` (the API project's URL plus `/api/v1`), `VITE_SENTRY_DSN`.
- **The build fails if any of the first three is missing**, rather than
  shipping a client pointed at localhost. That is intentional — set them before
  the first deploy.

### 6.3 Worth knowing

- **Rolling back is one click** from Deployments: "Promote to Production" on
  the previous deployment. **Migrations do not roll back** — the runner is
  forward-only. A deploy that changes the schema destructively cannot be
  rescued this way.
- **Hobby forbids commercial use.** Fine while the app is free; monetising it
  means Pro.

---

## 7. Sentry and OpenAI

**Sentry** — two projects, one **React** and one **Node**, and their DSNs into
the two Vercel projects above. Both integrations are no-ops without a DSN and
outside production, so there is nothing to turn off for local work.

**An OpenAI spend cap** — **the only service here that can produce a real
bill.** At platform.openai.com → Settings → Limits, set a monthly **hard
limit** (the API stops at it) and a **soft limit** below it (an email).

The app has its own ceiling: `middleware/aiQuota.ts` refuses generation past
**ten per hour per climber**, counted from the `performances` and `trainings`
rows themselves, so it survives restarts and multiple instances. But that is
per climber — the account-wide ceiling has to come from OpenAI.

---

## 8. After deploying

### 8.1 The mail path

- `dig CNAME pm-bounces.<domain>` must answer `pm.mtasv.net`, **not** a
  Cloudflare IP — that is the proof the record is unproxied.
- Postmark's DNS page shows DKIM and Return-Path verified.
- Sign up with a **Gmail** address. Success means Postmark approval landed.
- Run one message through [mail-tester.com](https://www.mail-tester.com) and
  confirm SPF, DKIM and DMARC all pass.
- The confirmation link lands on `https://app.<domain>`.

### 8.2 The app

**Do this on `https://app.<domain>`.** Passkeys cannot be verified anywhere
else — see [section 5](#5-supabase).

1. **Photo upload** from the production origin. **The R2 CORS rule is the most
   likely thing to be wrong**, and it shows up as a silent upload failure
   rather than an error.
2. **Log Session** — wall angle and hold buttons, the weakness dropdown, the
   tries / sends counters.
3. **Editing after saving** — from the Sessions screen, edit and delete a saved
   session and its individual routes, and add a route to an existing session.
4. **Search** — filter by route name, gym, date range and grade.
5. **AI Coach** — generate an analysis. Opening the past-reports modal must
   **not** replace the card you are reading. Pin one from inside the modal.
6. **Report title** — the input sits at the top of the card, and after
   switching reports it still saves to the right one.
7. **Japanese** — switch language in Profile, walk every screen, then generate
   an AI report and confirm **the prose itself comes back in Japanese**.
8. **Passkeys** — enroll from Profile, sign out, sign in with Face ID / Touch
   ID.
9. **CSV import** — a file with bad rows: errors listed with line numbers, only
   the good rows imported.
10. **Mobile** — Log Session at 375px, the Session Date input intact.
11. **The AI quota** — the eleventh generation in an hour is refused with 429.

---

## 9. Cleanup

1. Watch it for a day, then **delete the Render service** and its deploy-hook
   secret. The workflow that called it is already gone from the repo.
2. Once the R2 path has run for a week, **empty the Supabase Storage
   `climb-media` bucket** and drop the four `climb-media` policies on
   `storage.objects`. The migration script never deletes from Supabase, so this
   is by hand.
3. Confirm Supabase's Storage usage is back to zero.

---

## Where the free tiers end

Values as of writing. **The first thing to break is the hundred emails a
month**, and the next is data volume — not user count.

| Service | Free tier | What happens past it |
| --- | --- | --- |
| Postmark | 100 emails / month | **stops delivering** (does not bill). Basic is $15/mo for 10,000 |
| Supabase | 500 MB database, 5 GB egress / month, project pauses after 7 idle days | writes refused / project paused. Pro is $25/mo |
| Vercel | 100 GB bandwidth / month | billed or throttled. Commercial use needs Pro |
| Cloudflare R2 | 10 GB, downloads free | metered on the excess only (~$0.015/GB) |
| Sentry | ~5,000 events / month | the excess is dropped |
| OpenAI | none — pay as you go | **the only place a bill appears. Cap it in [section 7](#7-sentry-and-openai)** |

The app allows each climber 200 MB of media (`MAX_ACCOUNT_BYTES` in
`media.controller.ts`). R2's 10 GB is fifty of those, if everyone filled theirs.

---

## Updating a local checkout

Only needed to run this branch locally.

```bash
pnpm install                    # root, frontend and server
cd server && pnpm db:migrate    # 0011 (list indexes) and 0012 (locale column)
```

Add the four `R2_*` variables to `server/.env`, pointed at `climb-media-dev`.
The server still starts without them; the media endpoints answer 503.
`frontend/.env.local` needs no change.
