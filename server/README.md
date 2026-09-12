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

## Deploy to Render (recommended, easiest)

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
