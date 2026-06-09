# Stay.

**A quiet record of where your time goes.**

Stay is an installable web app (PWA). You arrive somewhere, you tap *I'm here*.
It finds your location, recognizes the place if you've been before — or lets you
name it once and keeps it as a preset — and starts the clock. When you leave,
you stop it. Over time, the Log becomes an honest ledger of where your hours went.

## How it works

- **Check in** — one tap grabs your GPS fix and matches it against your saved
  places (100 m radius by default). Known place → greeted by name. New place →
  name it, and it's remembered.
- **Live stay** — an open stay (`left_at IS NULL`) is the running timer. Close
  the app, lock the phone, come back hours later — the clock is still right,
  because the truth lives in the database, not the tab.
- **Check out** — tap *I'm leaving*. Duration is computed and the stay lands in
  the Log, grouped by day with daily totals.

## Stack

pnpm monorepo:

| Path | What |
|---|---|
| `apps/web` | React 19 + Vite + `vite-plugin-pwa`. Talks directly to Supabase under RLS. |
| `apps/api` | Express API with batch ingest + automatic stay detection (for future background trackers). |
| `packages/shared` | Zod schemas, types, constants. |
| `supabase/` | Postgres migrations. Row-Level Security on every table. |

## Setup

1. Create a [Supabase](https://supabase.com) project and run the migrations in
   `supabase/migrations/` (SQL editor or `supabase db push`).
2. `cp apps/web/.env.example apps/web/.env` and fill in
   `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
3. ```sh
   pnpm install
   pnpm --filter @timespent/web dev
   ```

Geolocation requires HTTPS (localhost is fine for dev). To install it on a
phone, deploy `apps/web` (Vercel/Netlify), open it in the browser, and
*Add to Home Screen*.

## Roadmap

- [x] Check-in / check-out with place presets (MVP)
- [ ] Photo on check-in — proof you were really there
- [ ] Background tracking via [Overland](https://overland.p3k.app/)/[OwnTracks](https://owntracks.org/) → `/ingest` + automatic stay detection
- [ ] Daily stats rollups (`place_stats_daily`)
