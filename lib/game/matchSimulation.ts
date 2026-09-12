import type { Player, Manager } from '../types';

// ============================================================
// Match simulation formula (v1)
//
// Per side:
//   attackStrength  = f(MID + FWD skill) * 0.30 + teamRating * 0.30 + chemistry * 0.35 + luck
//   defenseStrength = f(DEF + GK skill)  * 0.30 + teamRating * 0.30 + chemistry * 0.35 + luck
//
// Team A's expected goals (xG) scale with Team A's attackStrength vs Team B's defenseStrength,
// and vice versa. Final score is sampled from a Poisson distribution around each team's xG,
// which keeps results realistic (mostly 0-4 goals, occasional upsets) instead of deterministic.
// ============================================================

const WEIGHTS = { skill: 0.3, rating: 0.3, chemistry: 0.35 } as const;
const MAX_LUCK_PERCENT = 5; // each team gets 0-5%, randomized per match

export interface TeamMatchInput {
  players: Player[]; // exactly 11 starters, including the GK
  manager?: Manager;
  chemistry: number; // 0-100, from calculateTeamChemistry
}

export interface TeamStrength {
  attackStrength: number;
  defenseStrength: number;
  attackSkill: number;
  defenseSkill: number;
  overallRating: number;
  luck: number;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function splitByGroup(players: Player[]) {
  return {
    gk: players.filter((p) => p.positionGroup === 'GK'),
    def: players.filter((p) => p.positionGroup === 'DEF'),
    mid: players.filter((p) => p.positionGroup === 'MID'),
    fwd: players.filter((p) => p.positionGroup === 'FWD'),
  };
}

export function computeTeamStrength(team: TeamMatchInput): TeamStrength {
  const { gk, def, mid, fwd } = splitByGroup(team.players);

  const attackSkill = avg([...mid, ...fwd].map((p) => p.skill));
  const defenseSkill = avg([...def, ...gk].map((p) => p.skill));
  const overallRating = avg(team.players.map((p) => p.rating));
  const luck = Math.random() * MAX_LUCK_PERCENT;

  const attackStrength =
    attackSkill * WEIGHTS.skill + overallRating * WEIGHTS.rating + team.chemistry * WEIGHTS.chemistry + luck;

  const defenseStrength =
    defenseSkill * WEIGHTS.skill + overallRating * WEIGHTS.rating + team.chemistry * WEIGHTS.chemistry + luck;

  return { attackStrength, defenseStrength, attackSkill, defenseSkill, overallRating, luck };
}

// Knuth's algorithm — fine for the small lambdas (~0.5-4) a football match produces.
function samplePoisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

export interface MatchResult {
  scoreA: number;
  scoreB: number;
  xgA: number;
  xgB: number;
  chemistryA: number;
  chemistryB: number;
  luckA: number;
  luckB: number;
  winner: 'A' | 'B' | 'draw';
}

const BASE_XG = 1.4; // tuning knob: raise for higher-scoring matches overall

export function simulateMatch(teamA: TeamMatchInput, teamB: TeamMatchInput): MatchResult {
  const a = computeTeamStrength(teamA);
  const b = computeTeamStrength(teamB);

  const xgA = Math.max(0.15, BASE_XG * (a.attackStrength / Math.max(1, b.defenseStrength)));
  const xgB = Math.max(0.15, BASE_XG * (b.attackStrength / Math.max(1, a.defenseStrength)));

  const scoreA = samplePoisson(xgA);
  const scoreB = samplePoisson(xgB);

  return {
    scoreA,
    scoreB,
    xgA,
    xgB,
    chemistryA: teamA.chemistry,
    chemistryB: teamB.chemistry,
    luckA: a.luck,
    luckB: b.luck,
    winner: scoreA === scoreB ? 'draw' : scoreA > scoreB ? 'A' : 'B',
  };
}
