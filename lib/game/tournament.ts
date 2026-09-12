import { supabase } from '../supabase/client';
import { fetchTeamLineup } from './roster';
import { calculateTeamChemistry } from './chemistry';
import { simulateMatch } from './matchSimulation';

export interface Fixture {
  teamAId: string;
  teamBId: string;
}

export function generateRoundRobin(teamIds: string[]): Fixture[] {
  const fixtures: Fixture[] = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      fixtures.push({ teamAId: teamIds[i], teamBId: teamIds[j] });
    }
  }
  return fixtures;
}

function fallbackLine(a: string, b: string, scoreA: number, scoreB: number): string {
  if (scoreA === scoreB) return `${a} and ${b} shared the points in a ${scoreA}-${scoreB} draw.`;
  const winner = scoreA > scoreB ? a : b;
  const loser = scoreA > scoreB ? b : a;
  return `${winner} beat ${loser} ${Math.max(scoreA, scoreB)}-${Math.min(scoreA, scoreB)}.`;
}

async function fetchCommentary(payload: Record<string, unknown>, fallback: string): Promise<string> {
  try {
    const res = await fetch('/api/commentary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    return data.commentary ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Runs a full round robin for every team in the room: simulates each fixture,
 * fetches an AI commentary line for it, and writes everything to `matches`.
 * Safe to call more than once — if matches already exist for this room it just
 * makes sure room.status reflects that and returns without re-simulating.
 */
export async function runTournament(roomId: string) {
  const { data: teams } = await supabase.from('teams').select('id, owner_name').eq('room_id', roomId);
  if (!teams || teams.length < 2) return;

  const { count: existing } = await supabase.from('matches').select('id', { count: 'exact', head: true }).eq('room_id', roomId);
  if ((existing ?? 0) > 0) {
    await supabase.from('rooms').update({ status: 'matches' }).eq('id', roomId);
    return;
  }

  const namesById = new Map(teams.map((t) => [t.id, t.owner_name]));
  const fixtures = generateRoundRobin(teams.map((t) => t.id));

  for (const fixture of fixtures) {
    const [lineupA, lineupB] = await Promise.all([fetchTeamLineup(fixture.teamAId), fetchTeamLineup(fixture.teamBId)]);

    const chemA = calculateTeamChemistry(lineupA.players, lineupA.manager);
    const chemB = calculateTeamChemistry(lineupB.players, lineupB.manager);

    const result = simulateMatch(
      { players: lineupA.players, manager: lineupA.manager, chemistry: chemA.score },
      { players: lineupB.players, manager: lineupB.manager, chemistry: chemB.score }
    );

    const teamAName = namesById.get(fixture.teamAId) ?? 'Team A';
    const teamBName = namesById.get(fixture.teamBId) ?? 'Team B';

    const { data: inserted } = await supabase
      .from('matches')
      .insert({
        room_id: roomId,
        team_a_id: fixture.teamAId,
        team_b_id: fixture.teamBId,
        team_a_score: result.scoreA,
        team_b_score: result.scoreB,
        team_a_chemistry: result.chemistryA,
        team_b_chemistry: result.chemistryB,
        team_a_luck: result.luckA,
        team_b_luck: result.luckB,
      })
      .select()
      .single();

    if (inserted) {
      const fallback = fallbackLine(teamAName, teamBName, result.scoreA, result.scoreB);
      const commentary = await fetchCommentary(
        {
          teamAName,
          teamBName,
          scoreA: result.scoreA,
          scoreB: result.scoreB,
          chemistryA: Math.round(result.chemistryA),
          chemistryB: Math.round(result.chemistryB),
          luckA: Math.round(result.luckA * 10) / 10,
          luckB: Math.round(result.luckB * 10) / 10,
          xgA: Math.round(result.xgA * 100) / 100,
          xgB: Math.round(result.xgB * 100) / 100,
        },
        fallback
      );
      await supabase.from('matches').update({ commentary }).eq('id', inserted.id);
    }
  }

  await supabase.from('rooms').update({ status: 'matches' }).eq('id', roomId);
}
