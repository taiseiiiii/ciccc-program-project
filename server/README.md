# Climb App — Server

Backend API for the climbing (bouldering) log app.
**Stack:** Node.js · Express · TypeScript · PostgreSQL (raw SQL via `pg`) · Supabase Auth (JWT verification via `jose`).

This is the minimal foundation: server bootstrap, a shared DB pool, a health
check, and a full CRUD slice for `sessions` that serves as the pattern to copy
for the other ERD entities. The schema for all 8 entities is built up by the
migrations in [`db/migrations/`](db/migrations).

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 10+ (`corepack enable` will provide it, or `npm i -g pnpm`)
- PostgreSQL 14+ running locally (or a connection string to a hosted DB)

## Setup

```bash
cd server
pnpm install
cp .env.example .env        # then set DATABASE_URL and SUPABASE_URL

# create the database (once)
createdb climb_app

# apply migrations + development seed data
pnpm db:migrate
pnpm db:seed
```

All `db:*` commands read `DATABASE_URL` from `.env` themselves — no shell
exporting, and `psql` is not required.

## Database migrations

Schema changes are forward-only SQL files in [`db/migrations/`](db/migrations),
applied in filename order and recorded in the `schema_migrations` table.

```bash
pnpm db:migrate     # apply everything pending
pnpm db:status      # what is applied / pending
pnpm db:seed        # LOCAL ONLY: load db/seed.sql (development fixtures)
pnpm db:reset       # LOCAL ONLY: drop everything, re-migrate, re-seed
```

**Reference data vs fixtures.** Anything the app cannot run without is a
migration, not a seed: the V0–V17 grade scale lives in
`0003_grades_master_data.sql` because `routes.grade_id` and `goals.grade_id` are
NOT NULL foreign keys. `db/seed.sql` holds only throwaway sample data (a demo
user with a placeholder `auth_user_id`, a few routes, one session), which is why
`db:seed` refuses non-local hosts. A production database is **migrated and never
seeded** — and still has its grades.

Rules that keep environments in sync:

- **Never edit an applied migration.** Each is checksummed, and `db:migrate`
  aborts if a recorded file changed. Add a new numbered file instead.
- **Never put `DROP` in a migration** unless dropping is genuinely the intent —
  migrations run against live production data. The destructive teardown lives
  separately in [`db/reset.sql`](db/reset.sql).
- `db:reset` and `db:seed` refuse any host other than localhost (override:
  `--force`), so pointing `DATABASE_URL` at production cannot wipe it or fill it
  with fixtures by accident. `db:migrate` has no such guard — migrating a remote
  database is the deploy step.
- Each migration runs in its own transaction, so a failure rolls back cleanly.
  Statements that cannot run in a transaction (e.g. `CREATE INDEX
CONCURRENTLY`) need a different approach.

In production this happens in the deploy's **build step**
(`scripts/vercel-build.sh`), before the new version is published: a deployment
that cannot migrate never goes live.

```bash
pnpm build && pnpm db:migrate:prod
```

Two things that step depends on:

- `MIGRATE_DATABASE_URL` must point at a **direct session** connection, not a
  transaction pooler. The runner takes a session-scoped advisory lock and runs
  multi-statement transactions, neither of which survives a pooler handing out
  a different connection per statement. The app itself runs through that
  pooler, so the two connection strings differ.
- Its presence is also the switch. Unset, the build skips migrating — which is
  what preview deployments want, since they should run against the schema
  production already has rather than moving it.

`0002_lock_down_data_api.sql` exists because this database may be hosted on
Supabase: it revokes the `anon`/`authenticated` privileges that Supabase's Data
API would otherwise use and enables RLS with no policies, so nothing reaches
these tables except this server. It is a no-op on a plain Postgres. The server
connects as the tables' owner, and owners are exempt from RLS — which is why no
policies are needed. Do not add `FORCE ROW LEVEL SECURITY`, and if the server is
ever switched to a non-owner role, give that role `BYPASSRLS`.

## Run

```bash
pnpm dev         # watch mode (tsx)
# or
pnpm build && pnpm start
```

Server defaults to <http://localhost:4000>.

## Project layout

```
server/
├── db/
│   ├── migrations/         # forward-only schema history, applied in order
│   ├── reset.sql           # local teardown (destructive, not a migration)
│   └── seed.sql            # demo user, V0–V17 grades, sample routes/session
└── src/
    ├── index.ts            # entrypoint: listen + graceful shutdown
    ├── app.ts              # express app: middleware + routes wiring
    ├── config/env.ts       # env loading/validation
    ├── db/pool.ts          # pg Pool, query(), pingDatabase()
    ├── db/ssl.ts           # TLS settings for the DB connection
    ├── db/migrate.ts       # migration runner (db:migrate / db:status / ...)
    ├── middleware/         # 404 + central error handler
    ├── routes/             # /api/v1 router + per-entity routers
    ├── controllers/        # HTTP layer: validation + status codes
    ├── repositories/       # SQL layer: parameterized queries
    └── utils/              # HttpError, asyncHandler
```

Layering per entity: **routes → controller → repository**. To add a new entity,
copy the three `session.*` files and register the router in
[`src/routes/index.ts`](src/routes/index.ts).

## Authentication

Authentication is delegated to **Supabase Auth**; this server never stores
credentials. `src/middleware/auth.ts` verifies the `Authorization: Bearer`
token on every request (except `/health`):

1. The JWT is verified against the Supabase project's JWKS endpoint
   (or with `SUPABASE_JWT_SECRET` for legacy HS256 projects).
2. The caller's `users` row is loaded by `auth_user_id` (= JWT `sub`). On the
   very first request it is created automatically from the token's claims
   (email + `first_name`/`last_name` from `user_metadata`) — "just-in-time
   provisioning". No sign-up endpoint needed.
3. The row is attached as `req.user`. Controllers take the owner from there —
   never from request bodies — and scope every query to it, so one user can
   never read or modify another user's data (foreign rows look like 404s).

## File storage

Photos and videos live in **Cloudflare R2**, and no byte of one passes through
this server. Uploading is two requests:

1. `POST /media/presign` — the client describes the file. Every rule is checked
   here: type, per-file size, per-account quota, and whether the session it is
   being pinned to belongs to the caller. The response carries the object key
   (chosen here, not by the client) and a URL good for exactly one upload.
2. `POST /media` — after the browser has PUT the bytes. The server asks storage
   what is actually there before writing the row, because the quota is computed
   from these rows and a row describing a file that was never uploaded would
   corrupt it.

The declared size and content type are **signed into** the upload URL, so
storage itself refuses anything that does not match. That is what makes the
size trustworthy; it used to be a number the client supplied and nothing ever
verified.

Reading is `POST /media/urls`, which signs display URLs in a batch and only for
keys the caller has a row for. And because the server holds the credentials, it
can delete: removing a session, a climb, or one attachment takes the stored
files with it.

Without `R2_*` configured the server still boots and only the media endpoints
answer 503 — the same treatment as a missing `OPENAI_API_KEY`.

## API

Base path: `/api/v1`

**Full API reference (Swagger UI): <http://localhost:4000/api/v1/docs>** — the
source of truth is [`docs/openapi.yaml`](docs/openapi.yaml). The raw spec is
also served at `/api/v1/openapi.yaml` for import into Postman/Insomnia or
client codegen (e.g. `openapi-typescript`).

All endpoints except `/health` require `Authorization: Bearer <supabase-jwt>`
and return `401` without one. Sessions, attempts, goals, and AI reports are
always scoped to the authenticated user.

| Method | Path                         | Description                             |
| ------ | ---------------------------- | --------------------------------------- |
| GET    | `/health`                    | Liveness + DB connectivity (public)     |
| GET    | `/users/me`                  | The caller's profile (auto-provisioned) |
| GET    | `/grades`, `/grades/:id`     | Grades (read-only, V0–V17)              |
| CRUD   | `/sessions`, `/sessions/:id` | The caller's gym visits; `POST` also takes nested `attempts` |
| R/U/D  | `/routes`, `/routes/:id`     | Climbing problems (shared)              |
| R/U/D  | `/attempts`, `/attempts/:id` | Tries at a route (`?session_id=`)       |
| CRUD   | `/goals`, `/goals/:id`       | The caller's target grades              |
| C/R/D  | `/performances`, `/performances/:id` | AI performance reports — `POST` generates one with GPT-4o |
| C/R/D  | `/trainings`, `/trainings/:id` | AI training plans — `POST` generates one with GPT-4o |

CRUD = `GET` list, `POST`, `GET :id`, `PATCH :id` (partial), `DELETE :id`;
R/U/D = the same minus `POST`; C/R/D = the same minus `PATCH`. Routes and
attempts are created only through `POST /sessions` (nested `attempts`), which
writes session + routes + attempts in one database transaction so a mid-save
failure can never leave a half-saved session behind.

The AI endpoints call OpenAI synchronously (a few seconds per `POST`) and need
`OPENAI_API_KEY` in `.env` (see `.env.example`); without it they answer `503`
while the rest of the API keeps working. Reports are immutable snapshots —
regenerating a period inserts a new row, so there is no `PATCH`.
Responses are JSON: success payloads are wrapped in `{ "data": ... }`, errors in
`{ "error": { "message": ... } }`.

> When you add or change an endpoint, update `docs/openapi.yaml` in the same PR
> so the docs never drift from the code.

### Quick check

```bash
curl http://localhost:4000/api/v1/health
# {"status":"ok","db":"up"}

# Authenticated call — grab an access token from the frontend
# (supabase.auth.getSession()) or the Supabase dashboard:
curl -X POST http://localhost:4000/api/v1/sessions \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"visit_date":"2026-07-07","gym_name":"The Hive","attempts":[{"grade_id":3,"route_name":"Yellow slab","is_success":true}]}'
```
