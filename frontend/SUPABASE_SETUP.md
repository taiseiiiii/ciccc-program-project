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
   Confirm the **Email** provider is enabled (it is by default), and turn
   **"Confirm email" OFF** for now. With it on, nobody can log in until they
   click a verification link, which gets in the way during development.
   We'll turn it back on before the public launch.
2. **Authentication → URL Configuration**
   Set **Site URL** to `http://localhost:5173`.

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

- Send the **Project URL** — that's all the Express server needs
  (`SUPABASE_URL` in `server/.env`; token verification uses the project's
  public JWKS endpoint, so no secret is required).
- Invite taisei to the organization so auth settings can be adjusted from
  the backend side too:
  **Organization Settings → Team → Invite member** →
  `isemiya.0509@gmail.com`, role **Developer**.

## Done checklist

- [ ] Project created under your own account, region set
- [ ] Database password saved somewhere safe
- [ ] Email confirmation OFF, Site URL = `http://localhost:5173`
- [ ] `frontend/.env.local` filled in (and not committed)
- [ ] Project URL sent to taisei
- [ ] taisei invited as Developer

Once this is done, continue with the frontend auth integration guide
(Supabase SDK + AuthContext + attaching the token to API calls).
