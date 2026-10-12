# ShotCraft

Product videos from your code. Give it a public GitHub repo (or a zipped
project) and describe what to show; an agent reads the code and uses the
video-shotcraft skill to make the video. Plan: `serverreal/docs/11-shotcraft-saas-plan.md`.

```
Browser ─► this app (Next.js 16) ─► Agent Studio API (agent.tmaritz.xyz) ─► OmniRoute (models)
                 │
                 └─► Supabase: Auth · Postgres (projects, videos) · Storage (uploads, renders)
```

## Run it

```bash
npm install
npm run dev            # http://localhost:3005
```

Settings live in `.env.local` (git-ignored, never commit): Supabase URL + anon
key, the server-only service-role key and database URL, and Agent Studio's URL
+ API key (`shotcraft-local`, created in the Agent Studio portal under
**API & Logs**).

## Scripts

| Command | What it does |
|---|---|
| `npm run db:migrate` | Apply `supabase/migrations/*.sql` (once each) to the Supabase database |
| `npm run invite -- you@example.com --password` | Add a team member with a one-time password (or drop `--password` to email an invite) |
| `npm run smoke` | End-to-end test against the real services. Needs the app on :3100 (`npm run build && npx next start -p 3100`); creates and deletes its own test user, video and job |

## Supabase dashboard settings (one-time)

- **Auth → Sign In / Providers:** turn **off** "Allow new users to sign up" —
  the team is added with `npm run invite`.
- **Auth → URL Configuration:** Site URL `http://localhost:3005`; add
  `http://localhost:3005/**` to Redirect URLs (needed for emailed sign-in links;
  password sign-in works without it). Add the real domain at deploy time.
- **Speed:** **JWT Signing Keys → migrate to asymmetric keys.** Every page checks
  the session; with asymmetric keys that check happens locally instead of a
  round trip to Supabase on each request.
- **Security:** the service-role key and database password were shared in a
  chat on 2026-10-11 — rotate both (Project Settings → API / Database).

## How it's built (for speed)

- Pages are **partially prerendered** (Next.js Cache Components): the shell is
  static and paints immediately; signed-in data streams in behind `<Suspense>`.
- No UI library, no web fonts, one CSS file. Client JavaScript only where it
  is needed: the new-video form (zip upload) and the live job view.
- Zips go straight from the browser to Supabase Storage; Agent Studio fetches
  them through a 1-hour signed link — big files never pass through this app.
- The Agent Studio key is used only on the server (`src/lib/agent.ts`, marked
  `server-only`); the browser talks to `/api/videos/*`, which checks the
  session before relaying.

## Layout

```
src/proxy.ts                       session refresh + sign-in gate (Next 16's middleware)
src/lib/agent.ts                   Agent Studio API client (server-only)
src/lib/supabase/{server,client}   Supabase clients
src/app/login                      password + emailed-link sign-in
src/app/(app)/videos               list · new · [id] (live job view)
src/app/api/videos/[id]/*          stream · sync · download · messages · cancel
supabase/migrations                database schema (tables, RLS, buckets, realtime)
```
