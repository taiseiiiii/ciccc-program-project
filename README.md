# ClimbLog AI

A bouldering logbook that turns what you actually did at the gym into coaching
you can act on.

Log a visit route by route — how many times you pulled on, how many of those
went, the wall angle, the holds, and why it didn't go. The app counts the parts
you can't count yourself (flash rate, success rate by angle, tries-to-send,
weeks-in-a-row) and an AI coach reads the aggregate back to you as a
performance report and a training plan. If something hurts, you record it, and
the plan routes around it.

Built as a full-stack program project: React 19 PWA, Express + PostgreSQL API,
Supabase for auth and Postgres, Cloudflare R2 for media, OpenAI for the coaching.

---

## What's in the box

| Screen           | What it does                                                              |
| ---------------- | ------------------------------------------------------------------------- |
| **Dashboard**    | This month at a glance, five-month trends, weekly streak, recent visits    |
| **Log session**  | The whole visit in one form — routes, counts, tags, notes, photos          |
| **Sessions**     | Every visit, searchable by gym, route, date or grade — and editable        |
| **Progress**     | Success rate by grade and wall angle, a 30-day heatmap, goals, PRs         |
| **AI Coach**     | Generated performance reports and training plans, saved and annotatable    |
| **Injuries**     | What hurts, a daily pain trend, and the guardrail on the training plans    |
| **Profile**      | Name, lifetime totals, storage, language, passkeys, CSV import             |

English and Japanese throughout, including the AI coach's own writing. Sign in
with a password or a passkey — Face ID, Touch ID, Windows Hello. Installable as
a PWA, works offline for anything already loaded, and ships iOS launch images
for the home-screen case.

---

## Architecture

```
frontend/          React 19 · Vite · TypeScript · Tailwind v4 · TanStack Query
  src/pages/         one file per screen, all lazy-loaded
  src/components/    shared UI (Button, Modal, ReportCard, MediaGallery, …)
  src/lib/           api client, Supabase client, date helpers, draft storage
  src/i18n/          en/ja catalogues, one namespace per screen

server/            Express 4 · TypeScript · node-postgres
  src/routes/        thin — path to controller, plus auth and rate limits
  src/controllers/   HTTP: validation and status codes, no SQL
  src/repositories/  SQL: every statement parameterized, every read user-scoped
  src/services/      the AI coach — prompts, schemas, injury guardrail
  db/migrations/     forward-only, checksummed, one transaction each
  docs/openapi.yaml  the full API contract (also served at /api/v1/docs)
```

Three rules the code sticks to:

1. **The user id comes from the verified JWT, never from a request body.** A row
   owned by someone else is indistinguishable from a missing one — always a 404.
2. **Controllers validate, repositories query.** No SQL above the repository
   layer, no `req`/`res` below it.
3. **AI reports are immutable snapshots.** Regenerating adds a row. The stats
   the model saw are stored beside its words, so an old report still means what
   it meant.

The ERD lives in [`required/climb-app-erd.md`](required/climb-app-erd.md).

---

## Quickstart

Needs Node 22+, pnpm, and either local PostgreSQL 16+ or a Supabase project.

```bash
# 1. API
cd server
cp .env.example .env          # fill in DATABASE_URL and SUPABASE_URL
pnpm install
pnpm db:migrate               # creates the schema and its reference data
pnpm db:seed                  # optional: ten weeks of believable demo climbing
pnpm dev                      # http://localhost:4000

# 2. Frontend, in another shell
cd frontend
cp .env.example .env.local    # fill in the two VITE_SUPABASE_* values
npm install
npm run dev                   # http://localhost:5173
```

Interactive API docs: <http://localhost:4000/api/v1/docs>

Two things the app will not start without: `SUPABASE_URL` on the server and the
two `VITE_SUPABASE_*` values on the client. Both fail loudly and say so.
`OPENAI_API_KEY` is optional — without it everything works except the two AI
endpoints, which answer 503.

---

## Commands

| Where      | Command             | What                                             |
| ---------- | ------------------- | ------------------------------------------------ |
| `server/`  | `pnpm dev`          | API with reload                                  |
| `server/`  | `pnpm test`         | vitest — validation, dates, TLS, guardrail, HTTP  |
| `server/`  | `pnpm typecheck`    | `tsc --noEmit`, tests included                    |
| `server/`  | `pnpm db:migrate`   | apply pending migrations                          |
| `server/`  | `pnpm db:status`    | list applied / pending                            |
| `server/`  | `pnpm db:reset`     | local only: drop, re-migrate, re-seed             |
| `frontend/`| `npm run dev`       | Vite dev server                                   |
| `frontend/`| `npm run lint`      | eslint                                            |
| `frontend/`| `npm run build`     | typecheck + production build                      |

CI runs the typecheck, tests, lint and both builds on every pull request.

---

## Deployment

Two Vercel projects — the frontend, and the API as a function that exports the
Express app (`server/api/index.ts`). Postgres, auth and email come from
Supabase; photos and videos live in Cloudflare R2; errors go to Sentry.

Migrations run in the API project's **build step**, not at boot: a deployment
that cannot migrate never goes live, so code can never reach production ahead
of the schema it needs. They connect through the direct session URL
(`MIGRATE_DATABASE_URL`) because the advisory lock that serialises them cannot
survive a transaction pooler, while the app itself runs through that pooler.
Preview deployments leave that variable unset and skip the step, running
against the schema production already has.

Everything that has to be clicked rather than committed — DNS records, the R2
bucket, Postmark, Supabase settings — is in [`MANUAL_SETUP.md`](MANUAL_SETUP.md).

---

## Documentation

| Document                                              | What it covers                                          |
| ----------------------------------------------------- | ------------------------------------------------------- |
| [`server/README.md`](server/README.md)                 | API layout, migration rules, auth, local setup           |
| [`server/docs/openapi.yaml`](server/docs/openapi.yaml) | Every endpoint, request and response shape               |
| [`MANUAL_SETUP.md`](MANUAL_SETUP.md)                   | Everything that is clicked, not committed — DNS, R2, Postmark, Vercel, Supabase |
| [`MANUAL_SETUP.ja.md`](MANUAL_SETUP.ja.md)             | 同上（日本語版）                                          |
| [`frontend/SUPABASE_SETUP.md`](frontend/SUPABASE_SETUP.md) | Creating the Supabase project and finding the keys  |
| [`frontend/API_INTEGRATION.md`](frontend/API_INTEGRATION.md) | How the client talks to the API                   |
| [`required/climb-app-erd.md`](required/climb-app-erd.md) | The entity-relationship diagram                        |
| [`docs/assignment-brief.md`](docs/assignment-brief.md) | The original course brief this project was built against |

---

## A note on the AI coaching

The coach is given pre-aggregated statistics, never raw rows: SQL does the
arithmetic, the model does the interpretation, and the prompt stays the same
size whether you have logged ten climbs or ten thousand.

It is also explicitly not a physiotherapist. Injury data is in the prompt so a
plan can route *around* a hurt body part — that is load management. Naming a
condition, prescribing rehab or estimating a recovery time is medical advice the
app does not give. The model is told so, and the generated plan is then
re-checked in code against the injured body parts before it is stored, with
anything dropped reported to the climber rather than quietly removed.

## License

MIT
