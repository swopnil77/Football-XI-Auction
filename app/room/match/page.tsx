'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase/client';
import { runTournament } from '../../../lib/game/tournament';
import styles from '../../../styles/match.module.css';

interface TeamRow {
  id: string;
  owner_name: string;
}

interface MatchRow {
  id: string;
  team_a_id: string;
  team_b_id: string;
  team_a_score: number;
  team_b_score: number;
  team_a_chemistry: number;
  team_b_chemistry: number;
  commentary: string | null;
}

interface RoomRow {
  id: string;
  status: string;
  host_name: string;
}

interface StandingRow {
  id: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

function computeStandings(teams: TeamRow[], matches: MatchRow[]): StandingRow[] {
  const table = new Map<string, StandingRow>(
    teams.map((t) => [t.id, { id: t.id, name: t.owner_name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }])
  );

  for (const m of matches) {
    const a = table.get(m.team_a_id);
    const b = table.get(m.team_b_id);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    a.gf += m.team_a_score;
    a.ga += m.team_b_score;
    b.gf += m.team_b_score;
    b.ga += m.team_a_score;
    if (m.team_a_score > m.team_b_score) {
      a.won++;
      a.points += 3;
      b.lost++;
    } else if (m.team_a_score < m.team_b_score) {
      b.won++;
      b.points += 3;
      a.lost++;
    } else {
      a.drawn++;
      b.drawn++;
      a.points++;
      b.points++;
    }
  }

  return Array.from(table.values()).sort((x, y) => y.points - x.points || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf);
}

function MatchInner() {
  const code = (useSearchParams().get('code') ?? '').toUpperCase();

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [myName, setMyName] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setMyName(localStorage.getItem('iconicxi:name'));
  }, []);

  async function load() {
    const [{ data: roomData }, { data: teamData }, { data: matchData }] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', code).maybeSingle(),
      supabase.from('teams').select('id, owner_name').eq('room_id', code).order('created_at', { ascending: true }),
      supabase.from('matches').select('*').eq('room_id', code).order('played_at', { ascending: true }),
    ]);
    if (roomData) setRoom(roomData as RoomRow);
    if (teamData) setTeams(teamData as TeamRow[]);
    if (matchData) setMatches(matchData as MatchRow[]);
  }

  useEffect(() => {
    if (!code) return;
    load();
    const channel = supabase
      .channel(`match-${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `room_id=eq.${code}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function handleRun() {
    setRunning(true);
    await runTournament(code);
    await load();
    setRunning(false);
  }

  const teamName = (id: string) => teams.find((t) => t.id === id)?.owner_name ?? '—';
  const isHost = myName === room?.host_name;
  const standings = computeStandings(teams, matches);

  return (
    <main className={styles.page}>
      <h1>Match day</h1>

      {matches.length === 0 ? (
        <>
          <p>Every squad is drafted — time to settle it on the pitch. Round robin, every team plays every other team once.</p>
          {isHost ? (
            <button className={styles.runButton} disabled={running || teams.length < 2} onClick={handleRun}>
              {running ? 'Playing every fixture…' : 'Run match day'}
            </button>
          ) : (
            <p>Waiting for {room?.host_name} to kick things off…</p>
          )}
        </>
      ) : (
        <>
          <h3>Standings</h3>
          <table className={styles.standingsTable}>
            <thead>
              <tr>
                <th>Team</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.played}</td>
                  <td>{s.won}</td>
                  <td>{s.drawn}</td>
                  <td>{s.lost}</td>
                  <td>{s.gf}</td>
                  <td>{s.ga}</td>
                  <td>{s.points}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Results</h3>
          {matches.map((m) => (
            <div key={m.id} className={styles.matchCard}>
              <div className={styles.matchScoreRow}>
                <span>{teamName(m.team_a_id)}</span>
                <span>
                  {m.team_a_score} – {m.team_b_score}
                </span>
                <span>{teamName(m.team_b_id)}</span>
              </div>
              {m.commentary && <p className={styles.commentary}>{m.commentary}</p>}
            </div>
          ))}
        </>
      )}
    </main>
  );
}

export default function MatchPage() {
  return (
    <Suspense fallback={<main className={styles.page}><p>Loading match day…</p></main>}>
      <MatchInner />
    </Suspense>
  );
}
