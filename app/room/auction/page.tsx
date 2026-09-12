'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase/client';
import {
  fetchQueueItemDetail,
  placeLiveBid,
  placeSealedBid,
  resolveIfExpired,
  advanceIfRevealDone,
  getTeamEligibility,
  MIN_RESERVE_PER_SLOT,
  OPENING_BID,
  QueueItemDetail,
} from '../../../lib/game/auction';
import { countOpenSlots } from '../../../lib/game/formations';
import styles from '../../../styles/auction.module.css';

interface TeamRow {
  id: string;
  owner_name: string;
  budget_remaining: number;
  formation: string | null;
}

interface RoomRow {
  id: string;
  status: string;
  bidding_mode: 'live' | 'sealed';
  settings: { bid_timer_seconds: number; min_bid_increment: number; squad_size: number };
}

interface CurrentAuctionRow {
  queue_id: string | null;
  phase: 'idle' | 'bidding' | 'resolving' | 'sold' | 'advancing';
  bidding_mode: 'live' | 'sealed';
  high_bid: number;
  high_bid_team_id: string | null;
  ends_at: string | null;
  reveal_until: string | null;
}

interface Eligibility {
  eligible: boolean;
  reason: string | null;
  budgetRemaining: number;
  playerSlots: string[];
  hasManager: boolean;
  formation: string | null;
}

function AuctionInner() {
  const code = (useSearchParams().get('code') ?? '').toUpperCase();
  const router = useRouter();

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [currentAuction, setCurrentAuction] = useState<CurrentAuctionRow | null>(null);
  const [item, setItem] = useState<QueueItemDetail | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [sealedBidCount, setSealedBidCount] = useState(0);
  const [bidInput, setBidInput] = useState('');
  const [sealedInput, setSealedInput] = useState('');
  const [sealedLocked, setSealedLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const lastQueueId = useRef<string | null>(null);

  useEffect(() => {
    setMyName(localStorage.getItem('iconicxi:name'));
  }, []);

  async function refreshTeams() {
    const { data } = await supabase
      .from('teams')
      .select('id, owner_name, budget_remaining, formation')
      .eq('room_id', code)
      .order('created_at', { ascending: true });
    if (data) setTeams(data as TeamRow[]);
  }

  async function refreshProgress() {
    const { count: total } = await supabase
      .from('auction_queue')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', code);
    const { count: done } = await supabase
      .from('auction_queue')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', code)
      .neq('status', 'pending')
      .neq('status', 'active');
    setProgress({ done: done ?? 0, total: total ?? 0 });
  }

  async function refreshCurrentAuction() {
    const { data: roomData } = await supabase.from('rooms').select('*').eq('id', code).maybeSingle();
    if (roomData) setRoom(roomData as RoomRow);
    if (roomData && roomData.status === 'team_building') return;

    const { data: ca } = await supabase.from('current_auction').select('*').eq('room_id', code).maybeSingle();
    if (!ca) return;
    setCurrentAuction(ca as CurrentAuctionRow);

    if (ca.queue_id && ca.queue_id !== lastQueueId.current) {
      lastQueueId.current = ca.queue_id;
      setBidInput('');
      setSealedInput('');
      setSealedLocked(false);
      setError(null);
      const detail = await fetchQueueItemDetail(ca.queue_id);
      setItem(detail);
      refreshProgress();
    }

    if (ca.queue_id) {
      const { count } = await supabase
        .from('bids')
        .select('team_id', { count: 'exact', head: true })
        .eq('queue_id', ca.queue_id);
      setSealedBidCount(count ?? 0);
    }
  }

  useEffect(() => {
    if (!code) return;
    refreshTeams();
    refreshCurrentAuction();

    const channel = supabase
      .channel(`auction-${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `room_id=eq.${code}` }, refreshTeams)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'current_auction', filter: `room_id=eq.${code}` },
        refreshCurrentAuction
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` },
        (payload) => setRoom(payload.new as RoomRow)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bids', filter: `room_id=eq.${code}` },
        refreshCurrentAuction
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_roster' }, () => refreshEligibility())
      .subscribe();

    const heartbeat = setInterval(() => {
      setNow(Date.now());
      resolveIfExpired(code);
      advanceIfRevealDone(code);
    }, 1200);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(heartbeat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const myTeam = teams.find((t) => t.owner_name === myName) ?? null;

  async function refreshEligibility() {
    if (!myTeam || !item) {
      setEligibility(null);
      return;
    }
    const e = await getTeamEligibility(myTeam.id, item);
    setEligibility(e);
  }

  useEffect(() => {
    refreshEligibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTeam?.id, item?.queueId, currentAuction?.phase]);

  const secondsLeft = currentAuction?.ends_at
    ? Math.max(0, Math.ceil((new Date(currentAuction.ends_at).getTime() - now) / 1000))
    : 0;
  const biddingMode = currentAuction?.bidding_mode ?? room?.bidding_mode ?? 'sealed';
  const minIncrement = room?.settings?.min_bid_increment ?? 5;
  const highBid = currentAuction?.high_bid ?? 0;
  const minNextBid = highBid > 0 ? highBid + minIncrement : OPENING_BID;
  const iAmWinning = currentAuction?.high_bid_team_id === myTeam?.id;

  function maxAllowedBid(): number {
    if (!eligibility) return 0;
    const playerSlotsOpen = countOpenSlots(eligibility.formation, eligibility.playerSlots);
    const remainingAfterThis =
      item?.itemType === 'player'
        ? playerSlotsOpen - 1
        : playerSlotsOpen + (eligibility.hasManager ? 0 : 1) - (item?.itemType === 'manager' ? 1 : 0);
    return eligibility.budgetRemaining - Math.max(0, remainingAfterThis) * MIN_RESERVE_PER_SLOT;
  }

  async function submitLiveBid(amount: number) {
    if (!myTeam || !currentAuction?.queue_id || !eligibility?.eligible) return;
    setError(null);
    const cap = maxAllowedBid();
    if (amount > cap) {
      setError(`Keep at least ${MIN_RESERVE_PER_SLOT} pts per open slot — max bid right now is ${cap}.`);
      return;
    }
    if (amount < minNextBid) {
      setError(`Bid at least ${minNextBid}.`);
      return;
    }
    try {
      await placeLiveBid(code, currentAuction.queue_id, myTeam.id, amount, room?.settings?.bid_timer_seconds ?? 20);
    } catch (e: any) {
      setError(e.message ?? 'Could not place that bid.');
    }
  }

  async function submitSealedBid() {
    if (!myTeam || !currentAuction?.queue_id || !eligibility?.eligible) return;
    const amount = parseInt(sealedInput, 10);
    if (!amount || amount < OPENING_BID) {
      setError(`Bid at least ${OPENING_BID}.`);
      return;
    }
    const cap = maxAllowedBid();
    if (amount > cap) {
      setError(`Keep at least ${MIN_RESERVE_PER_SLOT} pts per open slot — max bid right now is ${cap}.`);
      return;
    }
    setError(null);
    await placeSealedBid(code, currentAuction.queue_id, myTeam.id, amount);
    setSealedLocked(true);
  }

  if (room?.status === 'team_building') {
    return (
      <main className={styles.page}>
        <div className={styles.doneCard}>
          <h1>Auction complete</h1>
          <p>Every lot has been sold or passed on. Time to check your squad.</p>
          <button onClick={() => router.push(`/room/team?code=${code}`)}>View your team</button>
        </div>
      </main>
    );
  }

  if (!item || !currentAuction) {
    return (
      <main className={styles.page}>
        <p>Setting up the auction…</p>
      </main>
    );
  }

  if (currentAuction.phase === 'sold') {
    const winner = teams.find((t) => t.id === currentAuction.high_bid_team_id);
    return (
      <main className={styles.page}>
        <div className={styles.lotCard}>
          <div className={styles.itemTypeTag}>{winner ? 'SOLD' : 'PASSED'}</div>
          <h1 className={styles.itemName}>{item.name}</h1>
          {winner ? (
            <p>
              Goes to <strong>{winner.owner_name}</strong> for {currentAuction.high_bid} pts.
            </p>
          ) : (
            <p>No bids — passed on to the next lot.</p>
          )}
        </div>
      </main>
    );
  }

  const disabledReason = !myTeam
    ? 'Join a team first.'
    : secondsLeft <= 0
    ? 'Round closing…'
    : eligibility && !eligibility.eligible
    ? eligibility.reason
    : null;

  return (
    <main className={styles.page}>
      <div className={styles.progress}>
        Lot {progress.done + 1} of {progress.total}
      </div>

      <div className={styles.lotCard}>
        <div className={styles.itemTypeTag}>{item.itemType === 'player' ? item.positionGroup : 'MANAGER'}</div>
        <h1 className={styles.itemName}>{item.name}</h1>
        <div className={styles.itemMeta}>
          {item.itemType === 'player'
            ? `${item.position} · ${item.nationalTeam ?? ''} · OVR ${item.rating} / SKL ${item.skill}${
                item.current2026 ? ' · Active 2026' : ''
              }`
            : item.preferredFormation}
        </div>

        {item.itemType === 'player' && item.clubs && (
          <div className={styles.clubHistory}>{item.clubs.map((c) => `${c.name} (${c.start}–${c.end})`).join('  ·  ')}</div>
        )}

        <div className={styles.bidBlock}>
          <div className={styles.highBid}>
            <div className={styles.highBidValue}>{highBid > 0 ? highBid : OPENING_BID}</div>
            <div className={styles.highBidTeam}>
              {highBid > 0
                ? `${teams.find((t) => t.id === currentAuction.high_bid_team_id)?.owner_name ?? '—'} leads`
                : 'Starting price'}
            </div>
          </div>
          <div className={secondsLeft <= 5 ? styles.timerUrgent : styles.timer}>{secondsLeft}s</div>
        </div>

        {disabledReason && (
          <p className={styles.sealedLocked} style={{ color: 'var(--color-muted)' }}>
            {disabledReason}
          </p>
        )}

        {biddingMode === 'live' ? (
          <>
            <div className={styles.bidForm}>
              <input
                type="number"
                value={bidInput}
                onChange={(e) => setBidInput(e.target.value)}
                placeholder={`${minNextBid}+`}
                disabled={!!disabledReason || iAmWinning}
              />
              <button
                disabled={!!disabledReason || iAmWinning}
                onClick={() => submitLiveBid(parseInt(bidInput, 10) || minNextBid)}
              >
                {iAmWinning ? "You're winning" : 'Raise'}
              </button>
            </div>
            <div className={styles.quickBids}>
              {[minNextBid, minNextBid + minIncrement, minNextBid + minIncrement * 3].map((amt) => (
                <button key={amt} disabled={!!disabledReason || iAmWinning} onClick={() => submitLiveBid(amt)}>
                  {amt}
                </button>
              ))}
            </div>
          </>
        ) : sealedLocked ? (
          <p className={styles.sealedLocked}>Bid locked in — waiting on {Math.max(0, teams.length - sealedBidCount)} more.</p>
        ) : (
          <div className={styles.bidForm}>
            <input
              type="number"
              value={sealedInput}
              onChange={(e) => setSealedInput(e.target.value)}
              placeholder={`${OPENING_BID}+`}
              disabled={!!disabledReason}
            />
            <button disabled={!!disabledReason} onClick={submitSealedBid}>
              Lock in bid
            </button>
          </div>
        )}

        {error && (
          <p className={styles.sealedLocked} style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}

        {myTeam && (
          <div className={styles.myBudget}>
            Your budget: {myTeam.budget_remaining} pts · formation {myTeam.formation}
          </div>
        )}
      </div>

      <div className={styles.teamGrid}>
        {teams.map((t) => (
          <span key={t.id} className={t.id === currentAuction.high_bid_team_id ? styles.teamChipWinning : styles.teamChip}>
            {t.owner_name} · {t.budget_remaining}
          </span>
        ))}
      </div>
    </main>
  );
}

export default function AuctionPage() {
  return (
    <Suspense fallback={<main className={styles.page}><p>Loading auction…</p></main>}>
      <AuctionInner />
    </Suspense>
  );
}
