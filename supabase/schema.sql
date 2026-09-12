-- ============================================================
-- Iconic XI — Football Auction Game
-- Supabase / Postgres schema (v1)
-- ============================================================
-- Run this whole file once in the Supabase SQL editor for a fresh project.
-- Enable "Realtime" on: teams, current_auction, bids, matches
-- (Database → Replication → toggle the tables you want broadcast)

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Reference data: players & managers
-- ------------------------------------------------------------

create type position_group as enum ('GK', 'DEF', 'MID', 'FWD');

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position text not null,              -- e.g. 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'GK'
  position_group position_group not null,
  rating int not null check (rating between 1 and 99),
  skill int not null check (skill between 1 and 99),
  nationality text,
  national_team text,
  national_years jsonb,                -- { "start": 2005, "end": 2022 }
  clubs jsonb not null default '[]',    -- [{ "name": "Barcelona", "start": 2004, "end": 2021 }, ...]
  era text,
  current_2026 boolean not null default false,  -- true if this player is active in the 2026 season — lets rooms auction "current pros only"
  image_url text,
  created_at timestamptz not null default now()
);

create index idx_players_position_group on players(position_group);
create index idx_players_position on players(position);

create table managers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  preferred_formation text,
  clubs jsonb not null default '[]',
  national_teams jsonb not null default '[]',  -- [{ "name": "Spain", "start": 2008, "end": 2016 }]
  image_url text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Rooms & teams
-- ------------------------------------------------------------

create table rooms (
  id text primary key,                  -- short human-friendly room code, e.g. 'AB12CD'
  host_name text not null,
  status text not null default 'lobby', -- lobby | auctioning | team_building | matches | finished
  bidding_mode text not null default 'sealed', -- 'live' | 'sealed' (can change per-round too)
  settings jsonb not null default '{
    "starting_budget": 1000,
    "squad_size": 11,
    "bid_timer_seconds": 20,
    "min_bid_increment": 5,
    "current_squad_only": false
  }',
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  owner_name text not null,
  budget_remaining int not null,
  formation text,
  created_at timestamptz not null default now(),
  unique(room_id, owner_name)
);

create table team_roster (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid references players(id),
  manager_id uuid references managers(id),
  slot text not null,                   -- formation slot this fills, e.g. 'LB', 'ST1'
  acquired_price int not null,
  created_at timestamptz not null default now(),
  constraint one_of_player_or_manager check (
    (player_id is not null and manager_id is null) or
    (player_id is null and manager_id is not null)
  )
);

-- ------------------------------------------------------------
-- Auction flow
-- ------------------------------------------------------------

create table auction_queue (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  item_type text not null,              -- 'player' | 'manager'
  item_id uuid not null,
  order_index int not null,
  status text not null default 'pending', -- pending | active | sold | skipped
  winning_team_id uuid references teams(id),
  final_price int
);

create index idx_auction_queue_room_order on auction_queue(room_id, order_index);

-- One "live" row per room describing whatever is currently up for auction.
-- phase lifecycle: idle -> bidding -> resolving -> sold (brief reveal) -> bidding (next item) -> ... -> idle
create table current_auction (
  room_id text primary key references rooms(id) on delete cascade,
  queue_id uuid references auction_queue(id),
  phase text not null default 'idle',
  bidding_mode text not null default 'sealed',
  high_bid int default 0,
  high_bid_team_id uuid references teams(id),
  ends_at timestamptz,
  reveal_until timestamptz,   -- while phase='sold', how long to show the "SOLD to X" card before advancing
  updated_at timestamptz not null default now()
);

create table bids (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  queue_id uuid not null references auction_queue(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  amount int not null,
  created_at timestamptz not null default now()
);

create index idx_bids_queue on bids(queue_id);

-- ------------------------------------------------------------
-- Matches
-- ------------------------------------------------------------

create table matches (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  team_a_id uuid not null references teams(id),
  team_b_id uuid not null references teams(id),
  team_a_score int,
  team_b_score int,
  team_a_chemistry numeric,
  team_b_chemistry numeric,
  team_a_luck numeric,
  team_b_luck numeric,
  commentary text,
  played_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Row Level Security — permissive for v1 (friend-group game, no auth yet)
-- Tighten this later once you add real auth / per-room secrets.
-- ------------------------------------------------------------

alter table rooms enable row level security;
alter table teams enable row level security;
alter table team_roster enable row level security;
alter table auction_queue enable row level security;
alter table current_auction enable row level security;
alter table bids enable row level security;
alter table matches enable row level security;
alter table players enable row level security;
alter table managers enable row level security;

create policy "public read players" on players for select using (true);
create policy "public read managers" on managers for select using (true);
create policy "public all rooms" on rooms for all using (true) with check (true);
create policy "public all teams" on teams for all using (true) with check (true);
create policy "public all team_roster" on team_roster for all using (true) with check (true);
create policy "public all auction_queue" on auction_queue for all using (true) with check (true);
create policy "public all current_auction" on current_auction for all using (true) with check (true);
create policy "public all bids" on bids for all using (true) with check (true);
create policy "public all matches" on matches for all using (true) with check (true);
