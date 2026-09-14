# Iconic XI — Auction Engine

A small standalone Node process. It has no UI and isn't part of the Next.js app — it's the
single authority that closes expired auction rounds and advances to the next lot, so no
browser tab needs to be open (or racing other tabs) for a room's auction to keep moving.

It runs a tick loop every 500ms, checking Supabase for:
1. Rooms mid-bidding whose timer (`current_auction.ends_at`) has passed → picks the winner,
   assigns them a formation-compatible slot, deducts their budget.
2. Rooms showing a "SOLD" card whose reveal window (`current_auction.reveal_until`) has
   passed → advances to the next lot, or finishes the auction if the queue's empty.

Everything it writes goes through Supabase, so your existing Realtime subscriptions in the
Next.js app pick the changes up automatically — this service and the web app never talk to
each other directly.

## Why this needs its own host (not Vercel)

Vercel serverless functions are request-scoped — they spin up, handle one request, and tear
down. There's nowhere for a `setInterval` to live between requests. This needs a host that
keeps a process running continuously. Any of these work well for a project this size:

- **[Render](https://render.com)** — "Background Worker" service type is built for exactly
  this. Free tier available (spins down after inactivity, which adds a delay on the very
  next tick after idle — fine for testing, worth upgrading to a paid instance ($7/mo "Starter")
  if you want the auction to always resolve instantly).
- **[Railway](https://railway.app)** — usage-based, small free credit monthly, no spin-down.
- **[Fly.io](https://fly.io)** — free small VM allowance, no spin-down.

## Deploy to Render

1. Push this repo to GitHub (you've already got that part done).
2. Render dashboard → New → Background Worker → connect your repo.
3. **Root Directory**: `server`
4. **Build Command**: `npm install && npm run build`
5. **Start Command**: `npm start`
6. Environment variables (Render → your service → Environment):
   - `SUPABASE_URL` — your project's bare URL (no `/rest/v1/`)
   - `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Project Settings → API
7. Deploy. Check the logs — you should see `[engine] Iconic XI auction engine starting…`
   and `[engine] health check listening on :<port>` within a few seconds.

## Deploy to Railway (alternative — genuinely free for a service this light)

1. Railway dashboard → New Project → Deploy from GitHub repo → pick this repo.
2. **This is the step people miss**: open the new service → Settings → set **Root Directory**
   to `server`. Skip this and Railway builds the whole monorepo from its root — which means
   it tries to build the Next.js app instead, and fails with `supabaseUrl is required`
   because it's missing the frontend's `NEXT_PUBLIC_*` variables. That error is a sign this
   step got missed, not a real problem with the engine.
3. Variables tab → add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (same values as
   `server/.env`). Don't add any `NEXT_PUBLIC_*` variables here — those belong to the
   frontend's Vercel project, not this service.
4. Railway auto-detects the build/start commands from `server/package.json`
   (`npm run build` then `npm start`) — no need to set them manually.
5. Deploy, then check the logs for the same `[engine] ... starting…` line.

## Run it locally

```bash
cd server
npm install
cp .env.example .env   # fill in your Supabase values
npm run dev
```

## Sanity check it's alive

It exposes a tiny HTTP status endpoint (mostly for host health checks, but useful for you too):
```bash
curl https://your-engine-url.onrender.com/
# { "status": "ok", "lastTickAt": "...", "tickCount": 1234, "lastError": null }
```
`tickCount` climbing on repeated calls means it's running. `lastError` will show the most
recent failure if something's wrong (e.g. a bad key).
