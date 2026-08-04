export type HopUser = {
  id?: string;
  wallet_address?: string | null;

  fid: number | null;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;

  current_title: string;

  total_hops: number;
  current_streak: number;
  longest_streak: number;
  big_pond_energy: number;

  total_toby_atomic: string;
  total_usdc_atomic: string;

  first_hop_at: string | null;
  last_hop_at: string | null;

  today_hopped: boolean;
  rank: number | null;
};

export type LeaderboardKind =
  | 'streak'
  | 'hops'
  | 'toby';

export type LeaderRow = {
  id?: string;
  wallet_address?: string | null;

  fid: number | null;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;

  current_title: string;

  current_streak: number;
  total_hops: number;
  total_toby_atomic: string;

  rank: number;
};

export type LeaderboardResponse = {
  rows: LeaderRow[];
  kind: LeaderboardKind;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
};

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

export type PondEncounter = {
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

export type PondFind = {
  key: string;
  name: string;
  description: string;
  rarity: PondEncounterRarity;
  visualKey: string;
  timesFound: number;
  firstFoundAt: string;
  lastFoundAt: string;
};

export type PondJournalEntry = {
  id: string;
  hopId: string;
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


export type PondSecret = {
  key: string;
  name: string;
  description: string;
  source: string;
  unlockedAt: string;
};


export type PondCommunityDiscovery = {
  key: string;
  name: string;
  rarity: PondEncounterRarity;
  visualKey: string;
  travelers: number;
};

export type PondJournalConditions = {
  name: string;
  emoji: string;
  description: string;
  weather: string;
  season: string;
  mood: string;
  moonPhase: string;
  eventLabel: string;
  dayKey: string;
  forecastName: string;
  forecastEmoji: string;
  forecastHint: string;
};

export type NotificationHealth = {
  enabled: boolean;
  credentialsStored: boolean;
  status: 'subscribed' | 'missing_credentials' | 'disabled' | 'unknown';
};

export type PondJournal = {
  availableDiscoveries: number;
  uniqueDiscoveries: number;
  rareDiscoveries: number;
  secretDiscoveries: number;
  totalDiscoveryXp: number;
  recentFinds: PondFind[];
  recentEntries: PondJournalEntry[];
  recentSecrets: PondSecret[];
  conditions: PondJournalConditions | null;
  communityDiscoveries: PondCommunityDiscovery[];
  notificationHealth: NotificationHealth;
};

export type HopReceipt = {
  hopId: string;

  tobyAtomic: string;
  tobyDisplay: string;

  streak: number;
  totalHops: number;
  dailyPosition: number;

  title: string;
  castText: string;

  txHash: `0x${string}`;

  usdcAtomic?: string;
  alreadyRecorded?: boolean;
  accountAbstraction?: boolean | null;

  encounter: PondEncounter | null;
};
