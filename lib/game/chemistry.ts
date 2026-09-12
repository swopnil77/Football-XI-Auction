import type { Player, Manager } from '../types';

// ============================================================
// Chemistry formula (v1 — tune these constants via playtesting)
//
// For every pair of starters we add a bonus if they:
//   - played at the same CLUB in overlapping years   -> strong bonus
//   - played at the same CLUB in different eras      -> small "legacy" bonus
//   - played for the same NATIONAL TEAM together      -> strong bonus
//   - played for the same NATIONAL TEAM, different era -> small bonus
//   - are a known historic rivalry forced onto one team -> penalty (flavor)
// Plus a bonus per player who was actually coached by the team's manager.
//
// The raw sum is normalized into a 0–100 chemistry score.
// ============================================================

const CLUB_OVERLAP_BONUS = 6;
const CLUB_LEGACY_BONUS = 2;
const NATION_OVERLAP_BONUS = 5;
const NATION_LEGACY_BONUS = 1.5;
const MANAGER_LINK_BONUS = 4;
const RIVALRY_PENALTY = -3;

// Extend this over time — famous rivalries that hurt chemistry if forced together.
const RIVAL_PAIRS: [string, string][] = [
  ['Lionel Messi', 'Cristiano Ronaldo'],
];

function yearsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function clubSynergy(a: Player, b: Player): number {
  let bonus = 0;
  for (const clubA of a.clubs) {
    for (const clubB of b.clubs) {
      if (clubA.name === clubB.name) {
        bonus += yearsOverlap(clubA.start, clubA.end, clubB.start, clubB.end)
          ? CLUB_OVERLAP_BONUS
          : CLUB_LEGACY_BONUS;
      }
    }
  }
  return bonus;
}

function nationSynergy(a: Player, b: Player): number {
  if (!a.nationalTeam || a.nationalTeam !== b.nationalTeam) return 0;
  if (!a.nationalYears || !b.nationalYears) return NATION_LEGACY_BONUS;
  return yearsOverlap(a.nationalYears.start, a.nationalYears.end, b.nationalYears.start, b.nationalYears.end)
    ? NATION_OVERLAP_BONUS
    : NATION_LEGACY_BONUS;
}

function rivalryPenalty(a: Player, b: Player): number {
  const isRival = RIVAL_PAIRS.some(
    ([x, y]) => (x === a.name && y === b.name) || (x === b.name && y === a.name)
  );
  return isRival ? RIVALRY_PENALTY : 0;
}

function managerSynergy(player: Player, manager: Manager): number {
  let bonus = 0;
  for (const club of player.clubs) {
    for (const mgrClub of manager.clubs) {
      if (club.name === mgrClub.name && yearsOverlap(club.start, club.end, mgrClub.start, mgrClub.end)) {
        bonus += MANAGER_LINK_BONUS;
      }
    }
  }
  if (player.nationalTeam && player.nationalYears && manager.nationalTeams) {
    for (const nt of manager.nationalTeams) {
      if (nt.name === player.nationalTeam && yearsOverlap(player.nationalYears.start, player.nationalYears.end, nt.start, nt.end)) {
        bonus += MANAGER_LINK_BONUS;
      }
    }
  }
  return bonus;
}

export interface ChemistryPairDetail {
  pair: [string, string];
  club: number;
  nation: number;
  rivalry: number;
  total: number;
}

export interface ChemistryResult {
  score: number; // 0-100, normalized
  raw: number;
  breakdown: ChemistryPairDetail[];
}

/**
 * Calculates 0-100 team chemistry for an 11-player starting lineup (+ optional manager).
 * `maxPossible` is a tuning ceiling, not a hard theoretical max — adjust after playtesting
 * a few real rosters so a great, well-connected XI lands somewhere around 80-95.
 */
export function calculateTeamChemistry(players: Player[], manager?: Manager): ChemistryResult {
  let raw = 0;
  const breakdown: ChemistryPairDetail[] = [];

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const club = clubSynergy(players[i], players[j]);
      const nation = nationSynergy(players[i], players[j]);
      const rivalry = rivalryPenalty(players[i], players[j]);
      const total = club + nation + rivalry;
      if (total !== 0) {
        breakdown.push({ pair: [players[i].name, players[j].name], club, nation, rivalry, total });
      }
      raw += total;
    }
  }

  if (manager) {
    for (const p of players) {
      raw += managerSynergy(p, manager);
    }
  }

  const maxPossible = 55 * CLUB_OVERLAP_BONUS * 0.35 + players.length * MANAGER_LINK_BONUS;
  const score = Math.max(0, Math.min(100, (raw / maxPossible) * 100));

  return { score, raw, breakdown };
}
