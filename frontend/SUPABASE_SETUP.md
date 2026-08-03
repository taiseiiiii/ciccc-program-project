# Supabase Project Setup Guide

We use **Supabase Auth** for authentication. The project should be created
under **your** (frontend dev's) account: this app will live on as your
portfolio, so you must own the infrastructure — free-tier projects pause
after ~1 week of inactivity and only someone with dashboard access can wake
them up.

Total time: about 10 minutes.

## 1. Create an account

Go to [supabase.com](https://supabase.com) → **Start your project** → sign in
with **GitHub** (recommended — a portfolio project looks best tied to your own
GitHub account).

## 2. Create the project

On first sign-in you'll be asked to create an *organization* — use your own
name, **Free** plan. Then **New Project**:

| Field | Value |
| --- | --- |
| Project name | `climb-app` (or similar) |
| Database password | Keep the generated one and **save it in a password manager**. You won't need it day-to-day, but resetting it later is a hassle. |
| Region | **West US (Oregon / N. California)** or **Canada (Central)** — either is low-latency from Vancouver |
| Plan | Free |

Provisioning takes 1–2 minutes.

## 3. Auth settings (only two things)

1. **Authentication → Sign In / Providers**
   Confirm the **Email** provider is enabled (it is by default), and leave
   **"Confirm email" ON**.

   > We run a single Supabase project for both development and production, so
   > this setting cannot differ between them — and turning it off in production
   > would let anyone sign up with an address they don't own. The app handles the
   > confirmation step: after signing up (or trying to sign in before
   > confirming) you get a "Confirm your email" screen with a resend button, so
   > it does not block development. You just need a real inbox for test accounts.

2. **Authentication → URL Configuration**
   Set **Site URL** to `http://localhost:5173` for now, and change it to the
   deployed domain at release — it is what confirmation and password-reset links
   point at, so leaving it on localhost would break those emails in production.

   The app asks Supabase to return users to whatever origin it is running on, so
   add every origin you use to **Additional Redirect URLs** (the deployed domain
   once it exists). Unlisted URLs silently fall back to the Site URL.

## 4. Grab the keys

**Project Settings → API Keys** (older UI: Settings → API):

- **Project URL** — `https://<something>.supabase.co`
- **Publishable key** (formerly called the `anon` key) — safe to use in the
  browser

Put both in `frontend/.env.local` (gitignored):

```bash
VITE_SUPABASE_URL=<Project URL>
VITE_SUPABASE_ANON_KEY=<Publishable key>
VITE_API_URL=http://localhost:4000/api/v1
```

> ⚠️ The same page shows a **Secret key** (formerly `service_role`). It
> bypasses all auth. Never put it in `frontend/`, never commit it anywhere —
> we don't use it at all in this project.

## 5. Share with the backend (taisei)

- Send the **Project URL** (`SUPABASE_URL` in `server/.env`). Token verification
  uses the project's public JWKS endpoint, so no key or secret is needed for
  auth.
- Send the **database password** too, over something private. The app's data
  lives in this project's Postgres, so the server connects to it directly and
  that password is the only part invited members cannot look up themselves.
  Resetting it later breaks his connection string, so mention it if you do.
- Invite taisei to the organization so auth settings can be adjusted from
  the backend side too:
  **Organization Settings → Team → Invite member** →
  `isemiya.0509@gmail.com`, role **Developer**.

## Done checklist

- [ ] Project created under your own account, region set
- [ ] Database password saved somewhere safe (needed for the server's
      `DATABASE_URL` — it is not the publishable key, and invited members cannot
      see it)
- [ ] Email confirmation **ON**, Site URL = `http://localhost:5173`,
      `http://localhost:5173` in Additional Redirect URLs
- [ ] `frontend/.env.local` filled in (and not committed)
- [ ] Project URL sent to taisei
- [ ] taisei invited as Developer

Auth is already wired up in the app, so once this is done you can sign up and
land on the dashboard. To connect the rest of the pages to the API, see
[`API_INTEGRATION.md`](API_INTEGRATION.md).
