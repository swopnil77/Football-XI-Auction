import { supabase } from '../supabase/client';
import { findOpenCompatibleSlot } from './formations';
import type { Position } from '../types';

export interface QueueItemDetail {
  queueId: string;
  itemType: 'player' | 'manager';
  itemId: string;
  name: string;
  // player-only
  position?: Position;
  positionGroup?: string;
  rating?: number;
  skill?: number;
  clubs?: { name: string; start: number; end: number }[];
  nationalTeam?: string;
  era?: string;
  current2026?: boolean;
  // manager-only
  preferredFormation?: string;
}

interface RoomSettingsLite {
  starting_budget: number;
  squad_size: number;
  bid_timer_seconds: number;
  min_bid_increment: number;
}

const REVEAL_MS = 3000; // how long the "SOLD" state holds before the next lot appears
export const MIN_RESERVE_PER_SLOT = 5; // budget kept back per still-empty formation slot
export const OPENING_BID = 1; // every lot opens at 1 coin — no per-player floor, so an uncontested lot can go for as little as this

/**
 * Host-triggered, once: shuffles every player + manager into this room's auction
 * queue and activates the first item.
 */
export async function startAuction(roomId: string) {
  const { data: room } = await supabase.from('rooms').select('settings, bidding_mode').eq('id', roomId).single();
  const settings = (room?.settings ?? {}) as RoomSettingsLite & { current_squad_only?: boolean };
  const currentSquadOnly = !!settings.current_squad_only;

  let playerQuery = supabase.from('players').select('id');
  if (currentSquadOnly) playerQuery = playerQuery.eq('current_2026', true);
  const [{ data: players }, { data: managers }] = await Promise.all([
    playerQuery,
    supabase.from('managers').select('id'),
  ]);

  const items = [
    ...(players ?? []).map((p) => ({ item_type: 'player' as const, item_id: p.id })),
    ...(managers ?? []).map((m) => ({ item_type: 'manager' as const, item_id: m.id })),
  ];

  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  await supabase.from('auction_queue').delete().eq('room_id', roomId);

  const rows = items.map((it, index) => ({
    room_id: roomId,
    item_type: it.item_type,
    item_id: it.item_id,
    order_index: index,
  }));

  const { data: inserted } = await supabase
    .from('auction_queue')
    .insert(rows)
    .select('id, order_index')
    .order('order_index', { ascending: true });

  if (!inserted || inserted.length === 0) return;

  const first = inserted[0];

  await supabase.from('auction_queue').update({ status: 'active' }).eq('id', first.id);
  await supabase.from('current_auction').upsert({
    room_id: roomId,
    queue_id: first.id,
    phase: 'bidding',
    bidding_mode: room?.bidding_mode ?? 'sealed',
    high_bid: 0,
    high_bid_team_id: null,
    ends_at: new Date(Date.now() + (settings.bid_timer_seconds ?? 20) * 1000).toISOString(),
    reveal_until: null,
  });
}

export async function fetchQueueItemDetail(queueId: string): Promise<QueueItemDetail | null> {
  const { data: queueRow } = await supabase.from('auction_queue').select('*').eq('id', queueId).single();
  if (!queueRow) return null;

  if (queueRow.item_type === 'player') {
    const { data: p } = await supabase.from('players').select('*').eq('id', queueRow.item_id).single();
    if (!p) return null;
    return {
      queueId,
      itemType: 'player',
      itemId: p.id,
      name: p.name,
      position: p.position,
      positionGroup: p.position_group,
      rating: p.rating,
      skill: p.skill,
      clubs: p.clubs,
      nationalTeam: p.national_team,
      era: p.era,
      current2026: p.current_2026,
    };
  }

  const { data: m } = await supabase.from('managers').select('*').eq('id', queueRow.item_id).single();
  if (!m) return null;
  return {
    queueId,
    itemType: 'manager',
    itemId: m.id,
    name: m.name,
    preferredFormation: m.preferred_formation,
  };
}

/** Fetches everything needed to know whether a team CAN bid on the current item right now. */
export async function getTeamEligibility(teamId: string, item: QueueItemDetail) {
  const { data: rosterRows } = await supabase.from('team_roster').select('slot, manager_id').eq('team_id', teamId);
  const playerSlots = (rosterRows ?? []).filter((r) => !r.manager_id).map((r) => r.slot);
  const hasManager = (rosterRows ?? []).some((r) => r.manager_id);
  const { data: team } = await supabase.from('teams').select('formation, budget_remaining').eq('id', teamId).single();

  const base = {
    budgetRemaining: team?.budget_remaining ?? 0,
    playerSlots,
    hasManager,
    formation: team?.formation ?? null,
  };

  if (item.itemType === 'manager') {
    return { ...base, eligible: !hasManager, reason: hasManager ? 'You already have a manager.' : null, slotId: hasManager ? null : 'MANAGER' };
  }

  if (!team?.formation) {
    return { ...base, eligible: false, reason: 'Pick a formation in the lobby first.', slotId: null };
  }

  const openSlot = findOpenCompatibleSlot(team.formation, playerSlots, item.position as Position);
  return { ...base, eligible: !!openSlot, reason: openSlot ? null : `No open ${item.position} slot in your ${team.formation}.`, slotId: openSlot };
}

/** Live mode: an open raise. Guarded against writing into a round that has already moved on. */
export async function placeLiveBid(
  roomId: string,
  queueId: string,
  teamId: string,
  amount: number,
  timerSeconds: number
) {
  const { error } = await supabase.from('bids').insert({ room_id: roomId, queue_id: queueId, team_id: teamId, amount });
  if (error) throw error;

  await supabase
    .from('current_auction')
    .update({
      high_bid: amount,
      high_bid_team_id: teamId,
      ends_at: new Date(Date.now() + timerSeconds * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('room_id', roomId)
    .eq('queue_id', queueId);
}

/**
 * Sealed mode: submit (or silently replace) a private bid. No server-side secrecy —
 * RLS is permissive for v1 — the UI just never shows other teams' sealed bids before
 * the reveal. Fine for a friend-group game.
 */
export async function placeSealedBid(roomId: string, queueId: string, teamId: string, amount: number) {
  await supabase.from('bids').delete().eq('queue_id', queueId).eq('team_id', teamId);
  const { error } = await supabase.from('bids').insert({ room_id: roomId, queue_id: queueId, team_id: teamId, amount });
  if (error) throw error;
}

/**
 * Resolves the current round once its timer has passed: picks the winner, assigns
 * them a formation-compatible slot, deducts budget, and holds a brief "SOLD" reveal
 * before the next lot appears (see advanceIfRevealDone). Any connected client can
 * call this safely — an optimistic lock means only one caller's resolution sticks.
 */
export async function resolveIfExpired(roomId: string) {
  const { data: current } = await supabase.from('current_auction').select('*').eq('room_id', roomId).maybeSingle();
  if (!current || current.phase !== 'bidding' || !current.ends_at) return;
  if (new Date(current.ends_at).getTime() > Date.now()) return;

  const { data: claimed } = await supabase
    .from('current_auction')
    .update({ phase: 'resolving' })
    .eq('room_id', roomId)
    .eq('phase', 'bidding')
    .select()
    .maybeSingle();
  if (!claimed) return; // another client already resolved this round

  const { data: bids } = await supabase
    .from('bids')
    .select('*')
    .eq('queue_id', current.queue_id)
    .order('amount', { ascending: false })
    .order('created_at', { ascending: true });

  const winningBid = bids && bids.length > 0 ? bids[0] : null;
  const { data: queueRow } = await supabase.from('auction_queue').select('*').eq('id', current.queue_id).single();

  let soldTeamId: string | null = null;
  let soldPrice: number | null = null;

  if (winningBid && queueRow) {
    let slotId: string | null = null;

    if (queueRow.item_type === 'player') {
      const [{ data: player }, { data: existingRoster }, { data: team }] = await Promise.all([
        supabase.from('players').select('position').eq('id', queueRow.item_id).single(),
        supabase.from('team_roster').select('slot').eq('team_id', winningBid.team_id).is('manager_id', null),
        supabase.from('teams').select('formation').eq('id', winningBid.team_id).single(),
      ]);
      slotId = player
        ? findOpenCompatibleSlot(team?.formation, (existingRoster ?? []).map((r) => r.slot), player.position as Position)
        : null;
    } else {
      const { count } = await supabase
        .from('team_roster')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', winningBid.team_id)
        .not('manager_id', 'is', null);
      slotId = (count ?? 0) > 0 ? null : 'MANAGER';
    }

    if (slotId) {
      await supabase
        .from('auction_queue')
        .update({ status: 'sold', winning_team_id: winningBid.team_id, final_price: winningBid.amount })
        .eq('id', current.queue_id);

      await supabase.from('team_roster').insert({
        team_id: winningBid.team_id,
        player_id: queueRow.item_type === 'player' ? queueRow.item_id : null,
        manager_id: queueRow.item_type === 'manager' ? queueRow.item_id : null,
        slot: slotId,
        acquired_price: winningBid.amount,
      });

      const { data: team } = await supabase.from('teams').select('budget_remaining').eq('id', winningBid.team_id).single();
      if (team) {
        await supabase
          .from('teams')
          .update({ budget_remaining: team.budget_remaining - winningBid.amount })
          .eq('id', winningBid.team_id);
      }
      soldTeamId = winningBid.team_id;
      soldPrice = winningBid.amount;
    } else {
      // Safety net: the eligibility check should have stopped this at bid time, but
      // if a slot filled up in the meantime, void the sale rather than corrupt a roster.
      await supabase.from('auction_queue').update({ status: 'skipped' }).eq('id', current.queue_id);
    }
  } else if (queueRow) {
    await supabase.from('auction_queue').update({ status: 'skipped' }).eq('id', current.queue_id);
  }

  await supabase
    .from('current_auction')
    .update({
      phase: 'sold',
      reveal_until: new Date(Date.now() + REVEAL_MS).toISOString(),
      high_bid: soldPrice ?? 0,
      high_bid_team_id: soldTeamId,
    })
    .eq('room_id', roomId);
}

/** After the brief "SOLD" reveal window, moves on to the next lot (or ends the auction). */
export async function advanceIfRevealDone(roomId: string) {
  const { data: current } = await supabase.from('current_auction').select('*').eq('room_id', roomId).maybeSingle();
  if (!current || current.phase !== 'sold' || !current.reveal_until) return;
  if (new Date(current.reveal_until).getTime() > Date.now()) return;

  const { data: claimed } = await supabase
    .from('current_auction')
    .update({ phase: 'advancing' })
    .eq('room_id', roomId)
    .eq('phase', 'sold')
    .select()
    .maybeSingle();
  if (!claimed) return;

  await advanceToNext(roomId);
}

async function advanceToNext(roomId: string) {
  const { data: room } = await supabase.from('rooms').select('settings').eq('id', roomId).single();
  const settings = (room?.settings ?? {}) as RoomSettingsLite;

  const { data: current } = await supabase.from('current_auction').select('queue_id').eq('room_id', roomId).single();
  const { data: currentQueueRow } = current?.queue_id
    ? await supabase.from('auction_queue').select('order_index').eq('id', current.queue_id).single()
    : { data: null as { order_index: number } | null };

  const { data: next } = await supabase
    .from('auction_queue')
    .select('id')
    .eq('room_id', roomId)
    .eq('status', 'pending')
    .gt('order_index', currentQueueRow?.order_index ?? -1)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!next) {
    await supabase.from('current_auction').update({ phase: 'idle', reveal_until: null }).eq('room_id', roomId);
    await supabase.from('rooms').update({ status: 'team_building' }).eq('id', roomId);
    return;
  }

  await supabase.from('auction_queue').update({ status: 'active' }).eq('id', next.id);
  await supabase
    .from('current_auction')
    .update({
      queue_id: next.id,
      phase: 'bidding',
      high_bid: 0,
      high_bid_team_id: null,
      reveal_until: null,
      ends_at: new Date(Date.now() + (settings.bid_timer_seconds ?? 20) * 1000).toISOString(),
    })
    .eq('room_id', roomId);
}
