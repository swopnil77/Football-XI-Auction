// ============================================================
// Core domain types — keep these in sync with supabase/schema.sql
// ============================================================

export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'FWD';

export type Position =
  | 'GK'
  | 'CB' | 'LB' | 'RB'
  | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM'
  | 'LW' | 'RW' | 'ST';

export interface ClubStint {
  name: string;
  start: number;
  end: number;
}

export interface NationalYears {
  start: number;
  end: number;
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  positionGroup: PositionGroup;
  rating: number;   // 1-99, overall "star power" — feeds the ratings 30% weight
  skill: number;    // 1-99, positional ability — feeds the skill 30% weight
  nationality?: string;
  nationalTeam?: string;
  nationalYears?: NationalYears;
  clubs: ClubStint[];
  era?: string;
  imageUrl?: string;
}

export interface ManagerNationalStint {
  name: string;
  start: number;
  end: number;
}

export interface Manager {
  id: string;
  name: string;
  preferredFormation?: string;
  clubs: ClubStint[];
  nationalTeams?: ManagerNationalStint[];
  imageUrl?: string;
}

export interface TeamRosterEntry {
  id: string;
  teamId: string;
  playerId?: string;
  managerId?: string;
  slot: string;
  acquiredPrice: number;
}

export interface Team {
  id: string;
  roomId: string;
  ownerName: string;
  budgetRemaining: number;
  formation?: string;
}

export type BiddingMode = 'live' | 'sealed';

export interface RoomSettings {
  starting_budget: number;
  squad_size: number;
  bid_timer_seconds: number;
  min_bid_increment: number;
}

export interface Room {
  id: string;
  hostName: string;
  status: 'lobby' | 'auctioning' | 'team_building' | 'matches' | 'finished';
  biddingMode: BiddingMode;
  settings: RoomSettings;
}
