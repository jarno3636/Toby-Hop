export type PondEncounterCategory =
  | 'ambient'
  | 'find'
  | 'rare'
  | 'secret'
  | 'golden';

export type PondEncounterRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'legendary'
  | 'secret';

export type PondTimeOfDay =
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night';

export type PondEncounterConditions = {
  timeOfDay?: PondTimeOfDay[];
  minimumStreak?: number;
  maximumStreak?: number;
  minimumTotalHops?: number;
  maximumTotalHops?: number;
  daysOfWeek?: number[];
};

export type PondEncounterDefinitionRow = {
  id: string;
  encounter_key: string;
  name: string;
  description: string;
  category: PondEncounterCategory;
  rarity: PondEncounterRarity;
  probability: number | string;
  enabled: boolean;
  visual_key: string;
  reward_xp: number;
  repeatable: boolean;
  starts_at: string | null;
  ends_at: string | null;
  conditions: PondEncounterConditions | null;
  metadata: Record<string, unknown> | null;
};

export type PondEncounterRow = {
  id: string;
  fid: number;
  hop_id: string;
  encounter_definition_id: string;
  encounter_key: string;
  name: string;
  description: string;
  category: PondEncounterCategory;
  rarity: PondEncounterRarity;
  visual_key: string;
  reward_xp: number;
  first_discovery: boolean;
  roll_value: number | string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type ProcessPondEncounterInput = {
  fid: number;
  hopId: string;
  streak: number;
  totalHops: number;
  occurredAt?: Date;
};

export type PondEncounterResult = {
  id: string;
  key: string;
  name: string;
  description: string;
  category: PondEncounterCategory;
  rarity: PondEncounterRarity;
  visualKey: string;
  rewardXp: number;
  firstDiscovery: boolean;
  createdAt: string;
};
