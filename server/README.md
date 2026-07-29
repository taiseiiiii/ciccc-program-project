# Climb App — Server

Backend API for the climbing (bouldering) log app.
**Stack:** Node.js · Express · TypeScript · PostgreSQL (raw SQL via `pg`) · Supabase Auth (JWT verification via `jose`).

This is the minimal foundation: server bootstrap, a shared DB pool, a health
check, and a full CRUD slice for `sessions` that serves as the pattern to copy
for the other ERD entities. The full schema for all 8 entities lives in
[`db/schema.sql`](db/schema.sql).

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

# apply schema + seed data
pnpm db:reset               # = db:schema then db:seed
```

> `db:schema` / `db:seed` read `DATABASE_URL` from your shell. If you keep it in
> `.env`, export it first: `export $(grep -v '^#' .env | xargs)` — or pass the
> connection string inline.

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
│   ├── schema.sql          # all 8 ERD tables + updated_at trigger
│   └── seed.sql            # demo user, V0–V17 grades, sample routes/session
└── src/
    ├── index.ts            # entrypoint: listen + graceful shutdown
    ├── app.ts              # express app: middleware + routes wiring
    ├── config/env.ts       # env loading/validation
    ├── db/pool.ts          # pg Pool, query(), pingDatabase()
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

## API

Base path: `/api/v1`

**Full API reference (Swagger UI): <http://localhost:4000/api/v1/docs>** — the
source of truth is [`docs/openapi.yaml`](docs/openapi.yaml). The raw spec is
also served at `/api/v1/openapi.yaml` for import into Postman/Insomnia or
client codegen (e.g. `openapi-typescript`).

All endpoints except `/health` require `Authorization: Bearer <supabase-jwt>`
and return `401` without one. Sessions, attempts, and goals are always scoped
to the authenticated user.

| Method | Path                            | Description                     |
| ------ | ------------------------------- | ------------------------------- |
| GET    | `/health`                       | Liveness + DB connectivity (public) |
| GET    | `/users/me`                     | The caller's profile (auto-provisioned) |
| GET    | `/grades`, `/grades/:id`        | Grades (read-only, V0–V17)      |
| CRUD   | `/sessions`, `/sessions/:id`    | The caller's gym visits         |
| CRUD   | `/routes`, `/routes/:id`        | Climbing problems (shared)      |
| CRUD   | `/attempts`, `/attempts/:id`    | Tries at a route (`?session_id=`) |
| CRUD   | `/goals`, `/goals/:id`          | The caller's target grades      |

CRUD = `GET` list, `POST`, `GET :id`, `PATCH :id` (partial), `DELETE :id`.
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
  -d '{"visit_date":"2026-07-07","gym_name":"The Hive"}'
```
