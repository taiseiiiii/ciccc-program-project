# Frontend ↔ API Integration Guide

Everything you need to replace the local-only state in the pages with real API
calls. Auth is already wired end to end — you do **not** need to touch tokens,
headers, or user ids.

Interactive reference while the server runs: <http://localhost:4000/api/v1/docs>
(the spec itself is `server/docs/openapi.yaml`).

## Contents

1. [What already works](#1-what-already-works)
2. [The `api()` helper](#2-the-api-helper)
3. [Response and error shapes](#3-response-and-error-shapes)
4. [Rules that shape the API](#4-rules-that-shape-the-api)
5. [Endpoint reference](#5-endpoint-reference)
6. [TypeScript types to add](#6-typescript-types-to-add)
7. [Worked example: saving a session from LogSession](#7-worked-example-saving-a-session-from-logsession)
8. [Loading data into Dashboard / Progress](#8-loading-data-into-dashboard--progress)
9. [Known gaps to expect](#9-known-gaps-to-expect)

## 1. What already works

- `AuthProvider` owns the Supabase session; `useAuth()` exposes `session`,
  `loading`, `profile`, `profileError`, `signUp`, `signIn`, `signOut`.
- Route guards in `src/routes/AppRoutes.tsx` already keep unauthenticated users
  out of the app pages.
- `useAuth().profile` is the app-side user row (`GET /users/me`), fetched once a
  session exists. It is the only API call the frontend currently makes.

So the work is: **swap local `useState` bookkeeping for `api()` calls.**

## 2. The `api()` helper

`src/lib/api.ts` is the only thing you should use to reach the backend. It
already attaches the Supabase access token:

```ts
import { api } from "../lib/api";

const { data } = await api<{ data: Session[] }>("/sessions");
```

It handles, so you don't have to:

- reading the current access token and setting `Authorization: Bearer <jwt>`
- `Content-Type: application/json`
- throwing an `Error` carrying the server's message when the response is not OK
- returning `null` for `204 No Content` (used by every `DELETE`)

Method and body follow the standard `fetch` options:

```ts
await api<{ data: Session }>("/sessions", {
  method: "POST",
  body: JSON.stringify({ visit_date: "2026-07-29", gym_name: "The Hive" }),
});

await api<null>(`/sessions/${id}`, { method: "DELETE" });
```

Base URL comes from `VITE_API_URL` (`.env.local`), defaulting to
`http://localhost:4000/api/v1`. Paths you pass are relative to that, so start
them with `/`.

## 3. Response and error shapes

Every successful response wraps its payload in `data`:

```json
{ "data": { "session_id": 12, "visit_date": "2026-07-29", "gym_name": "The Hive" } }
```

Lists are the same, with an array:

```json
{ "data": [ { "session_id": 12 }, { "session_id": 13 } ] }
```

Errors use `error.message`, which is exactly what `api()` throws:

```json
{ "error": { "message": "visit_date is required and must be a YYYY-MM-DD date" } }
```

```ts
try {
  await api("/sessions", { method: "POST", body: JSON.stringify(payload) });
  toast.success("Saved");
} catch (err) {
  // err.message is the server's message, safe to show
  toast.error(err instanceof Error ? err.message : "Something went wrong");
}
```

Status codes you should expect:

| Code | Meaning | What to do |
| --- | --- | --- |
| 200 / 201 | Success | Use `data` |
| 204 | Deleted | `api()` resolves to `null` |
| 400 | Validation failed | Show `err.message` — it names the bad field |
| 401 | Missing/expired token | Session is gone; send the user to `/auth` |
| 404 | Not found **or not yours** | Treat as "does not exist" (see below) |
| 409 | Conflicts with related data | e.g. deleting a route still referenced |
| 500 | Server bug | Generic message, check the server console |

## 4. Rules that shape the API

These are deliberate backend decisions. Designing around them saves time:

1. **Never send `user_id`.** The owner is taken from the verified token. Sending
   one is ignored at best. `POST /sessions` takes only `visit_date` and
   `gym_name`; `POST /goals` takes no user field either.
2. **Other people's rows return `404`, not `403`.** Existence is never leaked. A
   404 means "not yours or not there" — same handling either way.
3. **Everything except `/health` needs a token.** `api()` covers this. If you
   get a 401, the Supabase session expired — don't retry, re-authenticate.
4. **`sessions`, `attempts` and `goals` are per-user.** You only ever see your
   own; no filtering needed on the client.
5. **`grades` and `routes` are shared.** Every user sees the same rows.
   `grades` is read-only.
6. **Dates are `YYYY-MM-DD` strings**, not ISO timestamps. `visit_date` and
   `target_date` are validated against that format and come back as plain
   strings, so no `Date` conversion or timezone handling is needed.

## 5. Endpoint reference

Base path `/api/v1`. `CRUD` means `GET` (list), `POST`, `GET /:id`,
`PATCH /:id` (partial), `DELETE /:id`.

### Users

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/users/me` | Caller's profile. Already used by `AuthProvider`. |

### Grades — read-only master data

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/grades` | All 18 rows, V0–V17 |
| GET | `/grades/:id` | |

`{ grade_id, grade_name: "V4", level: 4, created_at, updated_at }`

Fetch this once and keep it around — you need `grade_id` whenever you create a
route or a goal, and the UI works in `grade_name` (`"V4"`).

### Routes — climbing problems, shared

| Method | Path | Body |
| --- | --- | --- |
| CRUD | `/routes`, `/routes/:id` | `{ grade_id, route_name? }` |

`grade_id` is required and must exist. `route_name` is optional.

### Sessions — a gym visit, per-user

| Method | Path | Body |
| --- | --- | --- |
| CRUD | `/sessions`, `/sessions/:id` | `{ visit_date, gym_name? }` |

`visit_date` is required, `YYYY-MM-DD`. No `user_id`.

### Attempts — one try at a route, per-user via its session

| Method | Path | Body |
| --- | --- | --- |
| CRUD | `/attempts`, `/attempts/:id` | `{ session_id, route_id, is_success?, note? }` |

- `GET /attempts?session_id=12` filters to one of your sessions.
- On create, the `session_id` must be **yours** and the `route_id` must exist,
  otherwise you get a `400` naming which one was wrong.
- `PATCH` accepts `route_id`, `is_success`, `note` (not `session_id`).

### Goals — target grades, per-user

| Method | Path | Body |
| --- | --- | --- |
| CRUD | `/goals`, `/goals/:id` | `{ grade_id, goal_description?, target_date? }` |

`PATCH` also accepts `is_achieved`.

## 6. TypeScript types to add

`src/types/UserType.ts` exists. Add the rest to match the server rows:

```ts
// src/types/GradeType.ts
export default interface Grade {
  grade_id: number;
  grade_name: string; // "V0" .. "V17"
  level: number;      // 0..17
  created_at: string;
  updated_at: string;
}

// src/types/RouteType.ts
export default interface Route {
  route_id: number;
  grade_id: number;
  route_name: string | null;
  created_at: string;
  updated_at: string;
}

// src/types/SessionType.ts
export default interface Session {
  session_id: number;
  user_id: number;
  visit_date: string; // YYYY-MM-DD
  gym_name: string | null;
  created_at: string;
  updated_at: string;
}

// src/types/GoalType.ts
export default interface Goal {
  goal_id: number;
  user_id: number;
  grade_id: number;
  goal_description: string | null;
  is_achieved: boolean;
  achieved_at: string | null;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}
```

> Note: the existing `src/types/AttemptType.tsx` is the **UI's** attempt shape
> (`id`, `grade_name`, `route_name`, ...), which is not what the API stores. The
> server's `attempts` row is
> `{ attempt_id, session_id, route_id, is_success, note, created_at, updated_at }`
> — no grade or route name, those live on `routes`/`grades`. Keep the UI type for
> the form and add a separate `Attempt` type for API responses rather than
> forcing one shape to do both.

## 7. Worked example: saving a session from LogSession

`handleSaveSession` in `src/pages/LogSession.tsx` currently ends at
`console.log(saveSessionList)`. The UI collects a gym name, a date, and a list of
attempts that each carry a `grade_name` (`"V4"`) and a free-text `route_name`.

The API needs ids, so saving is three steps:

1. `POST /sessions` → get `session_id`
2. for each attempt, turn `grade_name` + `route_name` into a `route_id`
   (`POST /routes`)
3. `POST /attempts` for each, referencing both ids

```ts
import { api } from "../lib/api";
import type Grade from "../types/GradeType";
import type Route from "../types/RouteType";
import type Session from "../types/SessionType";

// Load once (e.g. in a useEffect) and keep in state — needed for grade_id.
const { data: grades } = await api<{ data: Grade[] }>("/grades");

const handleSaveSession = async () => {
  if (!gymName.trim()) {
    toast.error("Not found Location");
    return;
  }

  try {
    const { data: session } = await api<{ data: Session }>("/sessions", {
      method: "POST",
      body: JSON.stringify({ visit_date: visitDate, gym_name: gymName }),
    });

    // Sequential on purpose: a clearer error if one attempt fails.
    for (const attempt of attemptsList) {
      const grade = grades.find((g) => g.grade_name === attempt.grade_name);
      if (!grade) throw new Error(`Unknown grade ${attempt.grade_name}`);

      const { data: route } = await api<{ data: Route }>("/routes", {
        method: "POST",
        body: JSON.stringify({
          grade_id: grade.grade_id,
          route_name: attempt.route_name,
        }),
      });

      await api("/attempts", {
        method: "POST",
        body: JSON.stringify({
          session_id: session.session_id,
          route_id: route.route_id,
          is_success: attempt.is_success,
          note: attempt.note,
        }),
      });
    }

    resetAttemptForm();
    setGymName("");
    setVisitDate(today);
    setAttemptsList([]);
    toast.success("Successfully saved");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed to save session");
  }
};
```

Two things worth handling while you are in there:

- **Disable the save button while the request is in flight** (`isSaving` state),
  otherwise a double click creates two sessions.
- **Partial failure is possible.** If attempt 3 of 5 fails, the session and the
  first two attempts already exist. Simplest acceptable behaviour: report the
  error and leave the user on the page with their list intact. If we want
  all-or-nothing, ask the backend for a single `POST /sessions` that accepts
  nested attempts — that is a small server change and a much better API.

## 8. Loading data into Dashboard / Progress

Both pages are still placeholders. The data they need:

```ts
// Recent visits
const { data: sessions } = await api<{ data: Session[] }>("/sessions");

// Attempts for one session
const { data: attempts } = await api<{ data: Attempt[] }>(
  `/attempts?session_id=${sessionId}`,
);

// Goals
const { data: goals } = await api<{ data: Goal[] }>("/goals");
```

A small `useEffect` + `useState` per page is fine to start. If it gets repetitive
across pages, a tiny `useApi(path)` hook (data / loading / error) is worth
extracting — but do it after two or three pages exist, not before.

Note there is currently **no aggregate/statistics endpoint**. Anything like
"success rate by grade" or "sessions per month" has to be computed on the client
from `/sessions` + `/attempts`, or requested from the backend as a new endpoint.
For a realistic amount of data, computing on the client is fine.

## 9. Known gaps to expect

Real limitations of the current API — raise these rather than working around
them silently:

1. **Routes are created blindly.** There is no find-or-create and no uniqueness
   constraint, so logging "Crimpy Overhang" twice creates two `routes` rows. If
   we want route reuse, the backend should add a lookup (`GET /routes?name=`) or
   make `POST /routes` idempotent.
2. **No nested create.** Saving a session with N attempts is `1 + 2N` requests
   and is not atomic (see above).
3. **No pagination anywhere.** `GET /sessions` returns everything. Fine now,
   needs `?limit`/`?offset` before the data grows.
4. **Attempts carry no grade/route names.** Join client-side against `/routes`
   and `/grades`, or ask for an expanded response.
5. **`/performances` and `/trainings` (the AI reports) do not exist yet** — the
   tables are in the schema and the routes are commented out in
   `server/src/routes/index.ts`. AICoach has no backend to call.

## Running the backend locally

You run the API server yourself, pointed at the shared Supabase database — no
local Postgres to install.

```bash
cd server
pnpm install
cp .env.example .env
```

Fill in `server/.env`:

```bash
# From the Supabase dashboard: Connect -> Direct connection.
# [YOUR-PASSWORD] is the database password from when you created the project.
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres

# Supabase signs Postgres certs with its own CA; the file is already in the repo.
DATABASE_CA_CERT=./certs/prod-ca-2021.crt

SUPABASE_URL=https://<project-ref>.supabase.co
```

Then run both halves:

```bash
cd server   && pnpm dev      # http://localhost:4000
cd frontend && npm run dev   # http://localhost:5173 — needs .env.local, see SUPABASE_SETUP.md
```

`curl http://localhost:4000/api/v1/health` should return
`{"status":"ok","db":"up"}` before you debug anything else.

### Rules for the shared database

There is one Supabase project, and it is production. Nothing you do through the
app can hurt it, but two commands can:

- **Only run `pnpm dev`.** Never `pnpm db:migrate` — schema changes are applied
  by one person, and running it from a branch with new migrations would alter
  the production schema. If `pnpm dev` fails because a table or column is
  missing, say so rather than migrating.
- `pnpm db:seed` and `pnpm db:reset` already refuse to touch a non-local
  database, so you cannot wipe it by accident. Do not add `--force`.
- Accounts and rows you create while testing are real production data. Prefer
  reusing a couple of test accounts over making a new one each time.

### Test accounts need a real inbox

Email confirmation is **on**, so signing up sends a link that must be clicked
before the account works. The app shows a "Confirm your email" screen with a
resend button when this is pending.

Supabase's built-in email sending is rate limited, so a burst of test signups
will silently stop arriving. Use Gmail aliases — `you+test1@gmail.com`,
`you+test2@gmail.com` — so a handful of accounts all land in one inbox, and
reuse them.
