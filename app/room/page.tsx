'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';
import { startAuction } from '../../lib/game/auction';
import { FORMATION_NAMES } from '../../lib/game/formations';
import styles from '../../styles/room.module.css';

interface TeamRow {
  id: string;
  owner_name: string;
  budget_remaining: number;
  formation: string | null;
}

interface RoomRow {
  id: string;
  host_name: string;
  status: string;
  bidding_mode: string;
  settings: { current_squad_only?: boolean };
}

function RoomLobbyInner() {
  const code = (useSearchParams().get('code') ?? '').toUpperCase();
  const router = useRouter();

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setCurrentName(localStorage.getItem('iconicxi:name'));
  }, []);

  useEffect(() => {
    if (!code) {
      setNotFound(true);
      return;
    }
    let active = true;

    async function load() {
      const { data: roomData } = await supabase.from('rooms').select('*').eq('id', code).maybeSingle();
      if (!active) return;
      if (!roomData) {
        setNotFound(true);
        return;
      }
      setRoom(roomData as RoomRow);
      if (roomData.status === 'auctioning') {
        router.replace(`/room/auction?code=${code}`);
        return;
      }

      const { data: teamData } = await supabase
        .from('teams')
        .select('id, owner_name, budget_remaining, formation')
        .eq('room_id', code)
        .order('created_at', { ascending: true });
      if (active && teamData) setTeams(teamData as TeamRow[]);
    }

    load();

    const channel = supabase
      .channel(`room-${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `room_id=eq.${code}` }, () => load())
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` },
        (payload) => {
          if ((payload.new as any).status === 'auctioning') {
            router.replace(`/room/auction?code=${code}`);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [code, router]);

  async function setMyFormation(formation: string) {
    if (!currentName) return;
    const previous = teams.find((t) => t.owner_name === currentName)?.formation ?? null;
    // Update our own screen immediately — don't wait on Realtime to echo it back.
    setTeams((prev) => prev.map((t) => (t.owner_name === currentName ? { ...t, formation } : t)));
    const { error } = await supabase.from('teams').update({ formation }).eq('room_id', code).eq('owner_name', currentName);
    if (error) {
      setTeams((prev) => prev.map((t) => (t.owner_name === currentName ? { ...t, formation: previous } : t)));
    }
  }

  async function startAuctionHandler() {
    setStarting(true);
    await startAuction(code);
    await supabase.from('rooms').update({ status: 'auctioning' }).eq('id', code);
    router.push(`/room/auction?code=${code}`);
  }

  if (notFound) {
    return (
      <main className={styles.page}>
        <h1>Room not found</h1>
        <p>Double check the code with whoever sent it to you.</p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className={styles.page}>
        <p>Loading room…</p>
      </main>
    );
  }

  const isHost = currentName === room.host_name;
  const allFormationsSet = teams.length > 0 && teams.every((t) => !!t.formation);

  return (
    <main className={styles.page}>
      <div className={styles.codeRow}>
        <span className={styles.codeLabel}>Room code</span>
        <span className={styles.code}>{code}</span>
      </div>
      <h1>Waiting for managers</h1>
      <p>
        Share the code above. Bidding is set to <strong>{room.bidding_mode === 'live' ? 'live open bid' : 'sealed bid'}</strong>
        {room.settings?.current_squad_only ? ', 2026 squads only' : ''}. Every manager needs to pick a formation before the
        auction can start — it locks in which positions your XI needs.
      </p>

      <ul className={styles.teamList}>
        {teams.map((t) => {
          const isMe = t.owner_name === currentName;
          return (
            <li key={t.id} className={styles.teamRow}>
              <span>
                {t.owner_name}
                {t.owner_name === room.host_name && <span className={styles.hostBadge}>Host</span>}
              </span>
              {isMe ? (
                <select
                  value={t.formation ?? ''}
                  onChange={(e) => setMyFormation(e.target.value)}
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: 'var(--line)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-1) var(--space-2)',
                    color: 'var(--color-chalk)',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  <option value="" disabled>
                    Pick formation
                  </option>
                  {FORMATION_NAMES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={styles.budget}>{t.formation ?? 'choosing…'}</span>
              )}
            </li>
          );
        })}
      </ul>

      {isHost ? (
        <button
          className={styles.startButton}
          disabled={teams.length < 2 || !allFormationsSet || starting}
          onClick={startAuctionHandler}
        >
          {starting
            ? 'Shuffling the pool…'
            : teams.length < 2
            ? 'Need at least 2 managers'
            : !allFormationsSet
            ? 'Waiting on formations'
            : 'Start the auction'}
        </button>
      ) : (
        <p className={styles.waiting}>Waiting for {room.host_name} to start the auction…</p>
      )}
    </main>
  );
}

export default function RoomLobbyPage() {
  return (
    <Suspense fallback={<main className={styles.page}><p>Loading room…</p></main>}>
      <RoomLobbyInner />
    </Suspense>
  );
}
