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

// Round resolution (closing an expired bid, assigning the winner, advancing to the
// next lot) used to live here and be polled by every open browser tab. That's now
// owned exclusively by the standalone engine service in /server — see server/src/engine.ts
// for the equivalent logic. Keeping it in one place, run once, removed the multi-tab
// races and the dependency on someone having a tab open for the auction to progress.
