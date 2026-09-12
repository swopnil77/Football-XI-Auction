# Iconic XI

Draft an all-time-great football XI with friends via auction, then settle it on the pitch.
Next.js (App Router) + Supabase + a small standalone Node engine, built for 2–10 people each
on their own device.

## Architecture

Two deployable pieces:

1. **The Next.js app** (this root folder) — the actual UI. Deploys to Vercel as normal. Reads
   and writes to Supabase directly from the browser, and listens for changes via Supabase
   Realtime (WebSocket) so everyone's screen stays in sync.
2. **`/server`** — a standalone Node process that owns auction timing. It's the single source
   of truth for "has this bidding round's timer run out?" and "is it time to reveal the next
   lot?" — see `server/README.md` for what it does and how to deploy it. This is what makes
   the auction reliable: previously every open browser tab polled and raced to close rounds
   itself, which meant real races between tabs and the auction stalling if everyone closed
   their tab. Now there's exactly one authority, running continuously, independent of anyone
   having the page open.

Both pieces talk to the same Supabase project and never talk to each other directly — the
engine writes results, Realtime pushes them to whoever's connected.

## What's working right now

- **Room creation & joining** — writes real rows to Supabase; host also toggles bidding mode (live/sealed) and a **"2026 squads only" mode** that restricts the whole draft to current pros
- **Formation-locked lobby** — every manager picks one of 8 formations (4-3-3, 4-4-2, 4-3-2-1, 4-2-3-1, 5-3-2, 5-2-3, 3-5-2, 4-5-1) before the auction can start; that formation defines exactly which positions your XI needs
- **Auction engine**, formation-strict:
  - Live open bidding (countdown resets on each raise) or sealed private bidding, chosen per room
  - You can only bid on a player if your formation has a compatible **open slot** for their position — the UI disables bidding and tells you why when it doesn't
  - A small **budget reserve** is enforced so one big bid can't leave you unable to fill your remaining slots (`MIN_RESERVE_PER_SLOT` in `lib/game/auction.ts`)
  - Winning bids are assigned straight into the correct formation slot; a brief "SOLD to X for Y" reveal holds for a few seconds before the next lot
  - Any open tab can safely drive the auction forward (optimistic-locked resolution) — it doesn't stall if the host closes their tab
- **Team-builder / chemistry screen** (`/room/[roomCode]/team`) — a real formation "pitch" view of any team in the room, a live 0–100 chemistry score with a breakdown of exactly which player pairs and manager links are contributing, powered by `lib/game/chemistry.ts`
- **Dataset — full spec, exactly hit**: 15 GK, 70 DEF (14 natural LB + 14 natural RB), 70 MID, 70 FWD (225 players total), 20 managers. Real club/national-team history throughout. Only **5** players predate 1990 (Pelé, Yashin, Beckenbauer, Cruyff, Puskás); the rest are 1990s→2020s, and **66 players are flagged `current2026`** (Mbappé, Haaland, Yamal, Vinícius, Bellingham, Wirtz, etc.) across every position group, so a "2026 squads only" room can comfortably fill several full XIs
- **No price floors** — every lot opens at 1 coin (`OPENING_BID` in `lib/game/auction.ts`). If nobody else wants a player, you can win them for as little as 1. There's no `baseValue` concept left anywhere in the schema, data, or code.
- **Match simulation, fully wired up** (`/room/[roomCode]/match`) — host clicks "Run match day," it plays a full round robin (every team vs every other team once), writes real results to `matches`, and shows a standings table
- **AI match commentary** — after every simulated fixture, `app/api/commentary/route.ts` calls the Claude API (`claude-haiku-4-5-20251001`) server-side with the scoreline, xG, chemistry, and luck for that match, and asks for a short highlights-style recap. Falls back to a plain templated line if you haven't set `ANTHROPIC_API_KEY` — match day still works either way
- **CSS** in its own `styles/` folder, one file per screen, built on design tokens (`styles/tokens.css`)

## What's not built

Everything on your list is in. If you want to keep pushing: penalty-shootout tiebreakers, a bracket/knockout
mode as an alternative to round robin, and sold-lot celebration animation are natural next steps — none of
them require touching the schema or data layer.

## Known v1 simplifications (worth knowing before you lean on this for a real game night)

- **Sealed bids aren't cryptographically hidden.** RLS is permissive for v1 — the UI just never displays
  other teams' sealed bids before the reveal. A teammate poking at browser dev tools could peek.
- **The auction engine (`/server`) needs to actually be deployed and running** for rounds to
  close and lots to advance — without it, bids can still be placed but nothing will ever
  resolve. Check its `/` health endpoint if an auction seems stuck.
- **The dataset now meets the full target spec** (15/70/70/70 players, 20 managers) — big rooms and the
  "2026 only" mode both have enough pool to work with. Still just one instance of each real person, so a
  10-team room with heavy "current squad" filtering could theoretically run thinner on some positions —
  keep appending to `data/players.json` if you want more headroom, then `npm run seed`.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com) (the free tier is plenty).

3. **Run the schema** — open the SQL editor in your Supabase project and run the entire contents of
   `supabase/schema.sql`. Then go to Database → Replication and enable Realtime on: `teams`,
   `current_auction`, `bids`, `matches`, `rooms`, `team_roster`.

   > Already ran an earlier version of this schema? Run this once to catch up:
   > ```sql
   > alter table players add column if not exists current_2026 boolean not null default false;
   > alter table current_auction add column if not exists reveal_until timestamptz;
   > alter table matches add column if not exists commentary text;
   > alter table players drop column if exists base_value;
   > alter table managers drop column if exists base_value;
   > ```

4. **Set your environment variables** — `.env.local` is already filled in with your project's keys.
   If you ever need to redo it: `cp .env.example .env.local` and fill in Supabase → Project Settings → API.
   Optionally add `ANTHROPIC_API_KEY` (from [console.anthropic.com](https://console.anthropic.com)) for
   AI-written match commentary — without it, match day still runs, just with a plain fallback recap line.

5. **Seed the player/manager data**
   ```bash
   npm run seed
   ```
   Safe to re-run any time you edit `data/players.json` or `data/managers.json`.

6. **Deploy the auction engine** — see `server/README.md`. This is required for auctions to
   actually resolve; without it bids can be placed but rounds never close. Render's free
   "Background Worker" tier is the fastest way to get it running.

7. **Run it**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`, create a room on one device/tab, join from another with the room code.

## Growing the dataset

Append entries to `data/players.json` / `data/managers.json` following the existing shape, then
`npm run seed` again. No code changes needed.

## Tuning the formulas

`lib/game/chemistry.ts`, `lib/game/matchSimulation.ts`, and the reserve/timer constants in
`lib/game/auction.ts` all keep their weights as named constants at the top of the file specifically so
they're easy to playtest and retune without touching schema or UI.

## Formations

Defined in `lib/game/formations.ts` — each of the 8 formations is a list of slots with the positions that
can fill them (e.g. a 3-5-2's wing-back slots accept either a natural full-back or a winger). Add a 9th
formation by adding one more entry to `FORMATIONS`; nothing else needs to change.

## Design system

`styles/tokens.css` documents the direction: a "matchday under lights" feel — deep pitch-night
backgrounds, brass/gold for money and prestige, a muted brick-red reserved for live/urgent states only.
Oswald for headlines and scoreboard-style numbers, Work Sans for body copy.

