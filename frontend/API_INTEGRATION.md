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

- `AuthProvider` owns the Supabase session; `useAuth()` (from
  `src/hooks/useAuth.ts`) exposes `session`, `loading`, `profile`,
  `profileError`, `signUp`, `signIn`, `signOut`.
- Route guards in `src/routes/AppRoutes.tsx` already keep unauthenticated users
  out of the app pages.
- `useAuth().profile` is the app-side user row (`GET /users/me`), fetched once a
  session exists.
- TanStack Query is wired up (`QueryClientProvider` in `App.tsx`, client in
  `src/lib/queryClient.ts`, devtools included). `Dashboard` (`/health`) and
  `LogSession` (`/grades`, `POST /sessions`) show the patterns to copy.

So the work is: **swap local `useState` bookkeeping for `useQuery`/`useMutation`
around `api()` calls.**

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
   one is ignored at best. `POST /sessions` takes `visit_date`, `gym_name` and
   optionally nested `attempts`; `POST /goals` takes no user field either.
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
| GET / PATCH / DELETE | `/routes`, `/routes/:id` | PATCH: `{ grade_id?, route_name? }` |

There is **no `POST /routes`** — routes are created by `POST /sessions`
(nested `attempts`, see below).

### Sessions — a gym visit, per-user

| Method | Path | Body |
| --- | --- | --- |
| CRUD | `/sessions`, `/sessions/:id` | `{ visit_date, gym_name?, attempts? }` |

`visit_date` is required, `YYYY-MM-DD`. No `user_id`.

`POST` optionally nests
`attempts: [{ grade_id, route_name?, is_success?, note? }]`. Each entry creates
a route and an attempt on it, and session + routes + attempts are written in
**one database transaction** — a failed save persists nothing, so there is no
partial-failure state to handle. The `201` response is the session with an
`attempts` array.

### Attempts — one try at a route, per-user via its session

| Method | Path | Body |
| --- | --- | --- |
| GET / PATCH / DELETE | `/attempts`, `/attempts/:id` | PATCH: `{ route_id?, is_success?, note? }` |

- There is **no `POST /attempts`** — attempts are created via `POST /sessions`.
- `GET /attempts?session_id=12` filters to one of your sessions.
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

This is implemented in `src/pages/LogSession.tsx` — read it as the reference
pattern. The UI collects a gym name, a date, and a list of attempts that each
carry a `grade_name` (`"V4"`) and a free-text `route_name`. The API works in
ids, so the only client-side work is mapping `grade_name` → `grade_id` using
the cached `/grades` list; the whole visit is then saved with **one request**:

```ts
const queryClient = useQueryClient();

const { mutate: saveSession, isPending: isSavingSession } = useMutation({
  mutationFn: async (input: {
    visit_date: string;
    gym_name: string;
    grades: Grade[];
    attempts: AttemptType[];
  }) => {
    const attempts = input.attempts.map((attempt) => {
      const grade = input.grades.find(
        (g) => g.grade_name === attempt.grade_name,
      );
      if (!grade) throw new Error(`Unknown grade ${attempt.grade_name}`);
      return {
        grade_id: grade.grade_id,
        route_name: attempt.route_name,
        is_success: attempt.is_success,
        note: attempt.note,
      };
    });

    await api("/sessions", {
      method: "POST",
      body: JSON.stringify({
        visit_date: input.visit_date,
        gym_name: input.gym_name,
        attempts,
      }),
    });
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    // ...reset the form, success toast
  },
  onError: (err) => {
    toast.error(err instanceof Error ? err.message : "Failed to save session");
  },
});
```

Because the server writes session + routes + attempts in one transaction, there
is no partial failure to handle: either the whole visit is saved or nothing is.
Drive the save button's `disabled` and its "Saving..." label from the
mutation's `isPending` so a double click can't submit twice.

## 8. Loading data into Dashboard / Progress

Both pages are still placeholders. The data they need:

```ts
// Recent visits
const { data: sessions } = useQuery({
  queryKey: ["sessions"],
  queryFn: () => api<{ data: Session[] }>("/sessions"),
});

// Attempts for one session
const { data: attempts } = useQuery({
  queryKey: ["attempts", sessionId],
  queryFn: () => api<{ data: Attempt[] }>(`/attempts?session_id=${sessionId}`),
});

// Goals
const { data: goals } = useQuery({
  queryKey: ["goals"],
  queryFn: () => api<{ data: Goal[] }>("/goals"),
});
```

Use TanStack Query (`useQuery`) rather than hand-rolled `useEffect` +
`useState`: caching, loading/error state and refetching come for free, and the
`["sessions"]` key above is already invalidated by LogSession's save mutation,
so a new visit shows up without extra wiring. Put anything that identifies the
request (like `sessionId`) into the query key.

Note there is currently **no aggregate/statistics endpoint**. Anything like
"success rate by grade" or "sessions per month" has to be computed on the client
from `/sessions` + `/attempts`, or requested from the backend as a new endpoint.
For a realistic amount of data, computing on the client is fine.

## 9. Known gaps to expect

Real limitations of the current API — raise these rather than working around
them silently:

1. **Routes are created blindly.** Every attempt saved through `POST /sessions`
   creates a new `routes` row; there is no find-or-create and no uniqueness
   constraint, so logging "Crimpy Overhang" twice creates two rows. If we want
   route reuse, the backend should dedupe inside the bulk create (or add a
   lookup).
2. **No pagination anywhere.** `GET /sessions` returns everything. Fine now,
   needs `?limit`/`?offset` before the data grows.
3. **Attempts carry no grade/route names.** Join client-side against `/routes`
   and `/grades`, or ask for an expanded response.
4. **`/performances` and `/trainings` (the AI reports) do not exist yet** — the
   tables are in the schema and the routes are commented out in
   `server/src/routes/index.ts`. AICoach has no backend to call.

## Running the backend locally

You run the API server yourself, pointed at the shared Supabase database — no
local Postgres to install.

**Nothing here has to be sent to you by anyone.** The Supabase project is under
your account, so every value below comes from your own dashboard, and the
certificate is already committed to this repo.

Prerequisites: **Node 20+**, and pnpm for the server (the frontend stays on npm):

```bash
corepack enable      # provides pnpm — `pnpm install` fails without it
```

```bash
cd server
pnpm install
cp .env.example .env
```

Fill in `server/.env`. `<project-ref>` is the subdomain of your project URL —
`https://abcdefgh.supabase.co` means `<project-ref>` is `abcdefgh`:

```bash
# Dashboard -> Connect (top of the page) -> Direct connection.
# Pick Direct, not the transaction pooler.
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres

# Supabase signs Postgres certs with its own CA; the file is already in the repo.
DATABASE_CA_CERT=./certs/prod-ca-2021.crt

SUPABASE_URL=https://<project-ref>.supabase.co
```

`[YOUR-PASSWORD]` is the **database** password you chose when creating the
project — not the publishable key. If you no longer have it, reset it under the
dashboard's Database settings.

> ⚠️ Resetting that password invalidates the connection string taisei is using,
> so tell him if you do. Everything else here is safe to change on your own.

Then run both halves:

```bash
cd server   && pnpm dev      # http://localhost:4000
cd frontend && npm run dev   # http://localhost:5173
```

The frontend needs `frontend/.env.local` as well — the publishable key and
project URL, both from the same dashboard. See
[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) step 4, or copy `.env.example`.

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
