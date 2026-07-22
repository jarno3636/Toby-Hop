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
};
