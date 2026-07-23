# Climb App — Server

Backend API for the climbing (bouldering) log app.
**Stack:** Node.js · Express · TypeScript · PostgreSQL (raw SQL via `pg`).

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
cp .env.example .env        # then edit DATABASE_URL if needed

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

## API

Base path: `/api/v1`

**Full API reference (Swagger UI): <http://localhost:4000/api/v1/docs>** — the
source of truth is [`docs/openapi.yaml`](docs/openapi.yaml). The raw spec is
also served at `/api/v1/openapi.yaml` for import into Postman/Insomnia or
client codegen (e.g. `openapi-typescript`).

| Method | Path                            | Description                     |
| ------ | ------------------------------- | ------------------------------- |
| GET    | `/health`                       | Liveness + DB connectivity      |
| GET    | `/grades`, `/grades/:id`        | Grades (read-only, V0–V17)      |
| CRUD   | `/sessions`, `/sessions/:id`    | Gym visits                      |
| CRUD   | `/routes`, `/routes/:id`        | Climbing problems               |
| CRUD   | `/attempts`, `/attempts/:id`    | Tries at a route (`?session_id=`) |
| CRUD   | `/goals`, `/goals/:id`          | Target grades (`?user_id=`)     |

CRUD = `GET` list, `POST`, `GET :id`, `PATCH :id` (partial), `DELETE :id`.
Responses are JSON: success payloads are wrapped in `{ "data": ... }`, errors in
`{ "error": { "message": ... } }`.

> When you add or change an endpoint, update `docs/openapi.yaml` in the same PR
> so the docs never drift from the code.

### Quick check

```bash
curl http://localhost:4000/api/v1/health
# {"status":"ok","db":"up"}

curl -X POST http://localhost:4000/api/v1/sessions \
  -H 'Content-Type: application/json' \
  -d '{"user_id":1,"visit_date":"2026-07-07","gym_name":"The Hive"}'
```
