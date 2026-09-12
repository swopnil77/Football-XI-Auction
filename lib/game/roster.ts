import { supabase } from '../supabase/client';
import { mapPlayerRow, mapManagerRow } from './mappers';
import type { Player, Manager } from '../types';

export interface TeamLineup {
  players: Player[];
  manager?: Manager;
}

export async function fetchTeamLineup(teamId: string): Promise<TeamLineup> {
  const { data: rosterRows } = await supabase.from('team_roster').select('*').eq('team_id', teamId);

  const playerIds = (rosterRows ?? []).filter((r) => r.player_id).map((r) => r.player_id);
  const managerIds = (rosterRows ?? []).filter((r) => r.manager_id).map((r) => r.manager_id);

  const [{ data: playerRows }, { data: managerRows }] = await Promise.all([
    playerIds.length ? supabase.from('players').select('*').in('id', playerIds) : Promise.resolve({ data: [] as any[] }),
    managerIds.length ? supabase.from('managers').select('*').in('id', managerIds) : Promise.resolve({ data: [] as any[] }),
  ]);

  return {
    players: (playerRows ?? []).map(mapPlayerRow),
    manager: (managerRows ?? [])[0] ? mapManagerRow((managerRows ?? [])[0]) : undefined,
  };
}
