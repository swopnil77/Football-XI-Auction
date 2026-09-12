'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase/client';
import { getFormation } from '../../../lib/game/formations';
import { calculateTeamChemistry, ChemistryResult } from '../../../lib/game/chemistry';
import { mapPlayerRow, mapManagerRow } from '../../../lib/game/mappers';
import type { Player, Manager } from '../../../lib/types';
import styles from '../../../styles/team.module.css';

interface TeamRow {
  id: string;
  owner_name: string;
  formation: string | null;
  budget_remaining: number;
}

interface RosterEntry {
  slot: string;
  player: Player | null;
  manager: Manager | null;
}

function TeamInner() {
  const code = (useSearchParams().get('code') ?? '').toUpperCase();
  const router = useRouter();

  const [myName, setMyName] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [chemistry, setChemistry] = useState<ChemistryResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMyName(localStorage.getItem('iconicxi:name'));
  }, []);

  useEffect(() => {
    if (!code) return;
    let active = true;

    async function loadTeams() {
      const { data } = await supabase
        .from('teams')
        .select('id, owner_name, formation, budget_remaining')
        .eq('room_id', code)
        .order('created_at', { ascending: true });
      if (!active || !data) return;
      setTeams(data as TeamRow[]);
      if (!selectedTeamId) {
        const mine = (data as TeamRow[]).find((t) => t.owner_name === myName);
        setSelectedTeamId(mine?.id ?? (data[0] as TeamRow | undefined)?.id ?? null);
      }
    }

    loadTeams();

    const channel = supabase
      .channel(`team-${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `room_id=eq.${code}` }, loadTeams)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_roster' }, () => selectedTeamId && loadRoster(selectedTeamId))
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, myName]);

  async function loadRoster(teamId: string) {
    setLoading(true);
    const { data: rosterRows } = await supabase.from('team_roster').select('*').eq('team_id', teamId);

    const playerIds = (rosterRows ?? []).filter((r) => r.player_id).map((r) => r.player_id);
    const managerIds = (rosterRows ?? []).filter((r) => r.manager_id).map((r) => r.manager_id);

    const [{ data: playerRows }, { data: managerRows }] = await Promise.all([
      playerIds.length ? supabase.from('players').select('*').in('id', playerIds) : Promise.resolve({ data: [] }),
      managerIds.length ? supabase.from('managers').select('*').in('id', managerIds) : Promise.resolve({ data: [] }),
    ]);

    const playersById = new Map((playerRows ?? []).map((p) => [p.id, mapPlayerRow(p)]));
    const managersById = new Map((managerRows ?? []).map((m) => [m.id, mapManagerRow(m)]));

    const entries: RosterEntry[] = (rosterRows ?? []).map((r) => ({
      slot: r.slot,
      player: r.player_id ? playersById.get(r.player_id) ?? null : null,
      manager: r.manager_id ? managersById.get(r.manager_id) ?? null : null,
    }));
    setRoster(entries);

    const startingXI = entries.filter((e) => e.player).map((e) => e.player!) as Player[];
    const manager = entries.find((e) => e.manager)?.manager ?? undefined;
    setChemistry(calculateTeamChemistry(startingXI, manager));
    setLoading(false);
  }

  useEffect(() => {
    if (selectedTeamId) loadRoster(selectedTeamId);
  }, [selectedTeamId]);

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const formation = getFormation(selectedTeam?.formation);
  const manager = roster.find((r) => r.manager)?.manager ?? null;

  const rows: { row: string[]; label: string }[] = formation
    ? [
        { label: 'Attack', row: formation.slots.filter((s) => s.label.match(/ST|LW|RW/)).map((s) => s.id) },
        { label: 'Midfield', row: formation.slots.filter((s) => s.label.match(/CM|CDM|CAM|LM|RM/)).map((s) => s.id) },
        { label: 'Defense', row: formation.slots.filter((s) => s.label.match(/CB|LB|RB|LWB|RWB/)).map((s) => s.id) },
        { label: 'Goal', row: formation.slots.filter((s) => s.label === 'GK').map((s) => s.id) },
      ]
    : [];

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <h1>Squad</h1>
        <select className={styles.teamSelect} value={selectedTeamId ?? ''} onChange={(e) => setSelectedTeamId(e.target.value)}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.owner_name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={() => router.push(`/room/match?code=${code}`)}
        style={{
          background: 'var(--color-gold)',
          color: '#14150f',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-2) var(--space-4)',
          fontFamily: 'var(--font-display)',
          marginBottom: 'var(--space-4)',
        }}
      >
        Go to match day →
      </button>

      {!selectedTeam ? (
        <p className={styles.emptyState}>No teams yet.</p>
      ) : (
        <>
          <div className={styles.chemistryCard}>
            <div className={styles.chemistryScore}>{chemistry ? Math.round(chemistry.score) : '—'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--fs-small)', color: 'var(--color-muted)', marginBottom: 'var(--space-2)' }}>
                Team chemistry — {selectedTeam.formation ?? 'no formation'}
                {manager ? ` · Managed by ${manager.name}` : ''}
              </div>
              <div className={styles.chemistryBarTrack}>
                <div className={styles.chemistryBarFill} style={{ width: `${chemistry?.score ?? 0}%` }} />
              </div>
            </div>
          </div>

          {formation && (
            <div className={styles.pitch}>
              {rows.map(({ label, row }) => (
                <div key={label} className={styles.pitchRow}>
                  {row.map((slotId) => {
                    const entry = roster.find((r) => r.slot === slotId && r.player);
                    const slotDef = formation.slots.find((s) => s.id === slotId)!;
                    return (
                      <div key={slotId} className={entry ? styles.slot : styles.slotEmpty}>
                        <div className={styles.slotLabel}>{slotDef.label}</div>
                        <div className={styles.slotName}>{entry ? entry.player!.name : 'Empty'}</div>
                        {entry && (
                          <div className={styles.slotLabel}>
                            {entry.player!.rating} / {entry.player!.skill}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className={styles.managerRow}>
                <div className={manager ? styles.slot : styles.slotEmpty}>
                  <div className={styles.slotLabel}>MGR</div>
                  <div className={styles.slotName}>{manager ? manager.name : 'Empty'}</div>
                </div>
              </div>
            </div>
          )}

          {chemistry && chemistry.breakdown.length > 0 && (
            <div className={styles.breakdown}>
              <h3>Chemistry links</h3>
              {chemistry.breakdown.map((b, i) => (
                <div key={i} className={styles.breakdownRow}>
                  <span>
                    {b.pair[0]} + {b.pair[1]}
                  </span>
                  <span className={b.total >= 0 ? styles.breakdownPositive : styles.breakdownNegative}>
                    {b.total > 0 ? '+' : ''}
                    {b.total}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!loading && roster.every((r) => !r.player && !r.manager) && (
            <p className={styles.emptyState}>No one drafted yet — head to the auction.</p>
          )}
        </>
      )}
    </main>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={<main className={styles.page}><p>Loading squad…</p></main>}>
      <TeamInner />
    </Suspense>
  );
}
