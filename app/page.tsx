'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase/client';
import { generateRoomCode } from '../lib/roomCode';
import styles from '../styles/lobby.module.css';

const DEFAULT_SETTINGS = {
  starting_budget: 1000,
  squad_size: 11,
  bid_timer_seconds: 20,
  min_bid_increment: 5,
  current_squad_only: false,
};

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [biddingMode, setBiddingMode] = useState<'live' | 'sealed'>('sealed');
  const [currentSquadOnly, setCurrentSquadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setError('Enter your name first.');
      return;
    }
    setLoading(true);
    setError(null);

    // Try a few times in case of an (unlikely) room code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRoomCode();
      const { error: roomError } = await supabase.from('rooms').insert({
        id: code,
        host_name: name.trim(),
        bidding_mode: biddingMode,
        settings: { ...DEFAULT_SETTINGS, current_squad_only: currentSquadOnly },
      });

      if (!roomError) {
        await supabase.from('teams').insert({
          room_id: code,
          owner_name: name.trim(),
          budget_remaining: DEFAULT_SETTINGS.starting_budget,
        });
        localStorage.setItem('iconicxi:name', name.trim());
        router.push(`/room?code=${code}`);
        return;
      }

      // 23505 = unique_violation — try another code. Anything else, bail out.
      if ((roomError as any).code !== '23505') {
        setError(roomError.message);
        setLoading(false);
        return;
      }
    }

    setError('Could not create a room right now — try again.');
    setLoading(false);
  }

  async function handleJoin() {
    const code = roomCodeInput.trim().toUpperCase();
    if (!name.trim() || !code) {
      setError('Enter your name and the room code.');
      return;
    }
    setLoading(true);
    setError(null);

    const { data: room, error: roomLookupError } = await supabase
      .from('rooms')
      .select('id, settings')
      .eq('id', code)
      .maybeSingle();

    if (roomLookupError || !room) {
      setError('No room found with that code.');
      setLoading(false);
      return;
    }

    const { error: joinError } = await supabase.from('teams').insert({
      room_id: code,
      owner_name: name.trim(),
      budget_remaining: (room.settings as any)?.starting_budget ?? DEFAULT_SETTINGS.starting_budget,
    });

    // Unique violation just means this name already claimed a team in this room — that's fine, rejoin.
    if (joinError && (joinError as any).code !== '23505') {
      setError(joinError.message);
      setLoading(false);
      return;
    }

    localStorage.setItem('iconicxi:name', name.trim());
    router.push(`/room?code=${code}`);
  }

  return (
    <main className={styles.page}>
      <section className="hero">
        <div className={styles.eyebrow}>Friends · Auction · Match Day</div>
        <h1>Iconic XI</h1>
        <p>
          Draft an all-time XI with your mates. Bid on the legends, build a squad with real chemistry, and
          settle the argument on the pitch.
        </p>
        <ul className={styles.formatList}>
          <li>
            <span>2–10</span>managers
          </li>
          <li>
            <span>11</span>starters each
          </li>
          <li>
            <span>245+</span>legends in the pool
          </li>
        </ul>
      </section>

      <section className={styles.panel}>
        <div className={styles.tabRow}>
          <button
            className={mode === 'create' ? styles.tabActive : styles.tab}
            onClick={() => setMode('create')}
          >
            Create room
          </button>
          <button className={mode === 'join' ? styles.tabActive : styles.tab} onClick={() => setMode('join')}>
            Join room
          </button>
        </div>

        <div className={styles.field}>
          <label htmlFor="name">Your name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" />
        </div>

        {mode === 'create' ? (
          <>
            <div className={styles.field}>
              <label htmlFor="mode-select">Bidding style</label>
              <select
                id="mode-select"
                value={biddingMode}
                onChange={(e) => setBiddingMode(e.target.value as 'live' | 'sealed')}
                style={{
                  width: '100%',
                  background: 'var(--color-bg-elevated)',
                  border: 'var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-3)',
                  color: 'var(--color-chalk)',
                }}
              >
                <option value="sealed">Sealed bid — everyone bids privately, highest wins</option>
                <option value="live">Live open bid — raise in real time</option>
              </select>
            </div>
            <label
              className={styles.field}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={currentSquadOnly}
                onChange={(e) => setCurrentSquadOnly(e.target.checked)}
                style={{ width: 'auto' }}
              />
              <span style={{ color: 'var(--color-muted)', fontSize: 'var(--fs-small)' }}>
                2026 squads only — draft from current pros, no legends
              </span>
            </label>
          </>
        ) : (
          <div className={styles.field}>
            <label htmlFor="code">Room code</label>
            <input
              id="code"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value)}
              placeholder="e.g. 7K2QP"
              style={{ textTransform: 'uppercase' }}
            />
          </div>
        )}

        <button
          className={styles.submit}
          disabled={loading}
          onClick={mode === 'create' ? handleCreate : handleJoin}
        >
          {loading ? 'One moment…' : mode === 'create' ? 'Create room' : 'Join room'}
        </button>

        {error && <div className={styles.error}>{error}</div>}
      </section>
    </main>
  );
}
