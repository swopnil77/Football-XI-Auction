import type { Player, Manager } from '../types';

export function mapPlayerRow(row: any): Player {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    positionGroup: row.position_group,
    rating: row.rating,
    skill: row.skill,
    nationality: row.nationality ?? undefined,
    nationalTeam: row.national_team ?? undefined,
    nationalYears: row.national_years ?? undefined,
    clubs: row.clubs ?? [],
    era: row.era ?? undefined,
    imageUrl: row.image_url ?? undefined,
  };
}

export function mapManagerRow(row: any): Manager {
  return {
    id: row.id,
    name: row.name,
    preferredFormation: row.preferred_formation ?? undefined,
    clubs: row.clubs ?? [],
    nationalTeams: row.national_teams ?? [],
    imageUrl: row.image_url ?? undefined,
  };
}
