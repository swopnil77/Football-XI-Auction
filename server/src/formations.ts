import type { Position } from './types';

export interface FormationSlot {
  id: string; // stored in team_roster.slot — must be unique within a formation
  label: string; // display label, e.g. 'LB'
  acceptedPositions: Position[];
}

export interface Formation {
  name: string;
  slots: FormationSlot[];
}

const CENTRAL_MID: Position[] = ['CDM', 'CM', 'CAM'];

export const FORMATIONS: Record<string, Formation> = {
  '4-3-3': {
    name: '4-3-3',
    slots: [
      { id: 'GK', label: 'GK', acceptedPositions: ['GK'] },
      { id: 'LB', label: 'LB', acceptedPositions: ['LB'] },
      { id: 'CB1', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'CB2', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'RB', label: 'RB', acceptedPositions: ['RB'] },
      { id: 'CM1', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'CM2', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'CM3', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'LW', label: 'LW', acceptedPositions: ['LW', 'LM'] },
      { id: 'ST', label: 'ST', acceptedPositions: ['ST'] },
      { id: 'RW', label: 'RW', acceptedPositions: ['RW', 'RM'] },
    ],
  },
  '4-4-2': {
    name: '4-4-2',
    slots: [
      { id: 'GK', label: 'GK', acceptedPositions: ['GK'] },
      { id: 'LB', label: 'LB', acceptedPositions: ['LB'] },
      { id: 'CB1', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'CB2', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'RB', label: 'RB', acceptedPositions: ['RB'] },
      { id: 'LM', label: 'LM', acceptedPositions: ['LM', 'LW'] },
      { id: 'CM1', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'CM2', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'RM', label: 'RM', acceptedPositions: ['RM', 'RW'] },
      { id: 'ST1', label: 'ST', acceptedPositions: ['ST'] },
      { id: 'ST2', label: 'ST', acceptedPositions: ['ST'] },
    ],
  },
  '4-3-2-1': {
    name: '4-3-2-1',
    slots: [
      { id: 'GK', label: 'GK', acceptedPositions: ['GK'] },
      { id: 'LB', label: 'LB', acceptedPositions: ['LB'] },
      { id: 'CB1', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'CB2', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'RB', label: 'RB', acceptedPositions: ['RB'] },
      { id: 'CM1', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'CM2', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'CM3', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'CAM1', label: 'CAM', acceptedPositions: ['CAM', 'CM'] },
      { id: 'CAM2', label: 'CAM', acceptedPositions: ['CAM', 'CM'] },
      { id: 'ST', label: 'ST', acceptedPositions: ['ST'] },
    ],
  },
  '4-2-3-1': {
    name: '4-2-3-1',
    slots: [
      { id: 'GK', label: 'GK', acceptedPositions: ['GK'] },
      { id: 'LB', label: 'LB', acceptedPositions: ['LB'] },
      { id: 'CB1', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'CB2', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'RB', label: 'RB', acceptedPositions: ['RB'] },
      { id: 'CDM1', label: 'CDM', acceptedPositions: ['CDM', 'CM'] },
      { id: 'CDM2', label: 'CDM', acceptedPositions: ['CDM', 'CM'] },
      { id: 'LM', label: 'LM', acceptedPositions: ['LM', 'LW'] },
      { id: 'CAM', label: 'CAM', acceptedPositions: ['CAM', 'CM'] },
      { id: 'RM', label: 'RM', acceptedPositions: ['RM', 'RW'] },
      { id: 'ST', label: 'ST', acceptedPositions: ['ST'] },
    ],
  },
  '5-3-2': {
    name: '5-3-2',
    slots: [
      { id: 'GK', label: 'GK', acceptedPositions: ['GK'] },
      { id: 'LB', label: 'LB', acceptedPositions: ['LB'] },
      { id: 'CB1', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'CB2', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'CB3', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'RB', label: 'RB', acceptedPositions: ['RB'] },
      { id: 'CM1', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'CM2', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'CM3', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'ST1', label: 'ST', acceptedPositions: ['ST'] },
      { id: 'ST2', label: 'ST', acceptedPositions: ['ST'] },
    ],
  },
  '5-2-3': {
    name: '5-2-3',
    slots: [
      { id: 'GK', label: 'GK', acceptedPositions: ['GK'] },
      { id: 'LB', label: 'LB', acceptedPositions: ['LB'] },
      { id: 'CB1', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'CB2', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'CB3', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'RB', label: 'RB', acceptedPositions: ['RB'] },
      { id: 'CM1', label: 'CM', acceptedPositions: ['CDM', 'CM'] },
      { id: 'CM2', label: 'CM', acceptedPositions: ['CDM', 'CM'] },
      { id: 'LW', label: 'LW', acceptedPositions: ['LW', 'LM'] },
      { id: 'ST', label: 'ST', acceptedPositions: ['ST'] },
      { id: 'RW', label: 'RW', acceptedPositions: ['RW', 'RM'] },
    ],
  },
  '3-5-2': {
    name: '3-5-2',
    slots: [
      { id: 'GK', label: 'GK', acceptedPositions: ['GK'] },
      { id: 'CB1', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'CB2', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'CB3', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'LWB', label: 'LWB', acceptedPositions: ['LB', 'LM'] },
      { id: 'CM1', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'CM2', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'CM3', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'RWB', label: 'RWB', acceptedPositions: ['RB', 'RM'] },
      { id: 'ST1', label: 'ST', acceptedPositions: ['ST'] },
      { id: 'ST2', label: 'ST', acceptedPositions: ['ST'] },
    ],
  },
  '4-5-1': {
    name: '4-5-1',
    slots: [
      { id: 'GK', label: 'GK', acceptedPositions: ['GK'] },
      { id: 'LB', label: 'LB', acceptedPositions: ['LB'] },
      { id: 'CB1', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'CB2', label: 'CB', acceptedPositions: ['CB'] },
      { id: 'RB', label: 'RB', acceptedPositions: ['RB'] },
      { id: 'LM', label: 'LM', acceptedPositions: ['LM', 'LW'] },
      { id: 'CM1', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'CM2', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'CM3', label: 'CM', acceptedPositions: CENTRAL_MID },
      { id: 'RM', label: 'RM', acceptedPositions: ['RM', 'RW'] },
      { id: 'ST', label: 'ST', acceptedPositions: ['ST'] },
    ],
  },
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);

/** First open slot in this formation that accepts the given position, or null if none. */
export function findOpenCompatibleSlot(
  formationName: string | null | undefined,
  filledSlotIds: string[],
  position: Position
): string | null {
  if (!formationName) return null;
  const formation = FORMATIONS[formationName];
  if (!formation) return null;
  const filled = new Set(filledSlotIds);
  for (const slot of formation.slots) {
    if (!filled.has(slot.id) && slot.acceptedPositions.includes(position)) {
      return slot.id;
    }
  }
  return null;
}

export function countOpenSlots(formationName: string | null | undefined, filledSlotIds: string[]): number {
  if (!formationName) return 0;
  const formation = FORMATIONS[formationName];
  if (!formation) return 0;
  return formation.slots.length - new Set(filledSlotIds).size;
}

export function getFormation(name: string | null | undefined): Formation | null {
  if (!name) return null;
  return FORMATIONS[name] ?? null;
}
