import { supabase } from './supabase';
import { findOpenCompatibleSlot } from './formations';
import type { Position } from './types';

const REVEAL_MS = 3000; // how long a "SOLD" card holds before the next lot appears

export async function tick(): Promise<void> {
  await resolveExpiredBiddingRounds();
  await advanceRevealedRounds();
}

/** Any room whose bidding timer has passed gets its round closed and a winner assigned. */
async function resolveExpiredBiddingRounds() {
  const nowIso = new Date().toISOString();
  const { data: expired, error } = await supabase
    .from('current_auction')
    .select('*')
    .eq('phase', 'bidding')
    .not('ends_at', 'is', null)
    .lte('ends_at', nowIso);

  if (error) {
    console.error('[engine] failed to query expired rounds:', error.message);
    return;
  }

  for (const current of expired ?? []) {
    await resolveRound(current);
  }
}

async function resolveRound(current: any) {
  const roomId = current.room_id;

  // Optimistic lock: if two ticks somehow overlap, only one actually claims this round.
  const { data: claimed } = await supabase
    .from('current_auction')
    .update({ phase: 'resolving' })
    .eq('room_id', roomId)
    .eq('phase', 'bidding')
    .select()
    .maybeSingle();
  if (!claimed) return;

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
        ? findOpenCompatibleSlot(team?.formation ?? null, (existingRoster ?? []).map((r: any) => r.slot), player.position as Position)
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
      // Safety net: eligibility checks on the client should prevent this, but if a slot
      // filled in the meantime, void the sale rather than corrupt a roster.
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

  console.log(`[engine] room ${roomId}: ${soldTeamId ? `lot sold for ${soldPrice}` : 'lot passed, no bids'}`);
}

/** Any room whose "SOLD" reveal window has elapsed moves on to the next lot. */
async function advanceRevealedRounds() {
  const nowIso = new Date().toISOString();
  const { data: ready, error } = await supabase
    .from('current_auction')
    .select('*')
    .eq('phase', 'sold')
    .not('reveal_until', 'is', null)
    .lte('reveal_until', nowIso);

  if (error) {
    console.error('[engine] failed to query reveal-ready rounds:', error.message);
    return;
  }

  for (const current of ready ?? []) {
    await advanceOne(current);
  }
}

async function advanceOne(current: any) {
  const roomId = current.room_id;

  const { data: claimed } = await supabase
    .from('current_auction')
    .update({ phase: 'advancing' })
    .eq('room_id', roomId)
    .eq('phase', 'sold')
    .select()
    .maybeSingle();
  if (!claimed) return;

  const { data: room } = await supabase.from('rooms').select('settings').eq('id', roomId).single();
  const settings = (room?.settings ?? {}) as { bid_timer_seconds?: number };

  const { data: currentQueueRow } = current.queue_id
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
    console.log(`[engine] room ${roomId}: auction complete`);
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

  console.log(`[engine] room ${roomId}: advanced to next lot`);
}
