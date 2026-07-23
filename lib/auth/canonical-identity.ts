import { getAddress, isAddress, type Address } from 'viem';

import { readAppSession } from '@/lib/auth/app-session';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type CanonicalAuthMethod = 'farcaster' | 'siwe';

export type CanonicalHopUserRow = {
  fid: number;
  wallet_address: string | null;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  current_title: string | null;
  total_hops: number | string | null;
  current_streak: number | string | null;
  longest_streak: number | string | null;
  big_pond_energy: number | string | null;
  total_toby_atomic: number | string | null;
  total_usdc_atomic: number | string | null;
  first_hop_at: string | null;
  last_hop_at: string | null;
  last_hop_day?: string | null;
  today_hopped?: boolean | null;
  rank?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type CanonicalIdentity = {
  authMethod: CanonicalAuthMethod;
  fid: number | null;
  wallet: Address | null;
  user: CanonicalHopUserRow | null;
};

function normalizeAddress(value: unknown): Address | null {
  if (typeof value !== 'string' || !isAddress(value)) return null;
  return getAddress(value);
}

function safeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeAtomic(value: unknown): string {
  try {
    return BigInt(String(value ?? '0')).toString();
  } catch {
    return '0';
  }
}

function maximumAtomic(a: unknown, b: unknown): string {
  const first = BigInt(safeAtomic(a));
  const second = BigInt(safeAtomic(b));
  return (first >= second ? first : second).toString();
}

function earliestDate(a?: string | null, b?: string | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const at = Date.parse(a);
  const bt = Date.parse(b);
  if (!Number.isFinite(at)) return b;
  if (!Number.isFinite(bt)) return a;
  return at <= bt ? a : b;
}

function latestDate(a?: string | null, b?: string | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const at = Date.parse(a);
  const bt = Date.parse(b);
  if (!Number.isFinite(at)) return b;
  if (!Number.isFinite(bt)) return a;
  return at >= bt ? a : b;
}

function chooseTitle(
  fidUser: CanonicalHopUserRow | null,
  walletUser: CanonicalHopUserRow | null,
): string {
  const fidTitle = fidUser?.current_title?.trim();
  const walletTitle = walletUser?.current_title?.trim();

  if (
    safeNumber(walletUser?.total_hops) > safeNumber(fidUser?.total_hops) &&
    walletTitle
  ) {
    return walletTitle;
  }

  if (fidTitle && fidTitle !== 'New Hopper') return fidTitle;
  if (walletTitle && walletTitle !== 'New Hopper') return walletTitle;
  return fidTitle ?? walletTitle ?? 'New Hopper';
}

function mergeRows(
  sessionFid: number | null,
  sessionWallet: Address | null,
  fidUser: CanonicalHopUserRow | null,
  walletUser: CanonicalHopUserRow | null,
): CanonicalHopUserRow | null {
  if (!fidUser && !walletUser) return null;

  const base = fidUser ?? walletUser;
  if (!base) return null;

  const ranks = [
    safeNumber(fidUser?.rank),
    safeNumber(walletUser?.rank),
  ].filter((rank) => rank > 0);

  return {
    ...walletUser,
    ...fidUser,
    fid: sessionFid ?? base.fid,
    wallet_address:
      sessionWallet ??
      normalizeAddress(fidUser?.wallet_address) ??
      normalizeAddress(walletUser?.wallet_address),
    username: fidUser?.username ?? walletUser?.username ?? null,
    display_name: fidUser?.display_name ?? walletUser?.display_name ?? null,
    pfp_url: fidUser?.pfp_url ?? walletUser?.pfp_url ?? null,
    current_title: chooseTitle(fidUser, walletUser),
    total_hops: Math.max(
      safeNumber(fidUser?.total_hops),
      safeNumber(walletUser?.total_hops),
    ),
    current_streak: Math.max(
      safeNumber(fidUser?.current_streak),
      safeNumber(walletUser?.current_streak),
    ),
    longest_streak: Math.max(
      safeNumber(fidUser?.longest_streak),
      safeNumber(walletUser?.longest_streak),
    ),
    big_pond_energy: Math.max(
      safeNumber(fidUser?.big_pond_energy),
      safeNumber(walletUser?.big_pond_energy),
    ),
    total_toby_atomic: maximumAtomic(
      fidUser?.total_toby_atomic,
      walletUser?.total_toby_atomic,
    ),
    total_usdc_atomic: maximumAtomic(
      fidUser?.total_usdc_atomic,
      walletUser?.total_usdc_atomic,
    ),
    first_hop_at: earliestDate(
      fidUser?.first_hop_at,
      walletUser?.first_hop_at,
    ),
    last_hop_at: latestDate(
      fidUser?.last_hop_at,
      walletUser?.last_hop_at,
    ),
    last_hop_day: latestDate(
      fidUser?.last_hop_day,
      walletUser?.last_hop_day,
    ),
    today_hopped: Boolean(
      fidUser?.today_hopped || walletUser?.today_hopped,
    ),
    rank: ranks.length ? Math.min(...ranks) : null,
    created_at: earliestDate(
      fidUser?.created_at,
      walletUser?.created_at,
    ),
    updated_at: latestDate(
      fidUser?.updated_at,
      walletUser?.updated_at,
    ),
  };
}

async function loadByFid(fid: number): Promise<CanonicalHopUserRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('toby_hop_users')
    .select('*')
    .eq('fid', fid)
    .maybeSingle();

  if (error) throw error;
  return data as CanonicalHopUserRow | null;
}

async function loadByWallet(wallet: Address): Promise<CanonicalHopUserRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('toby_hop_users')
    .select('*')
    .ilike('wallet_address', wallet.toLowerCase())
    .limit(20);

  if (error) throw error;

  const rows = (data ?? []) as CanonicalHopUserRow[];
  if (!rows.length) return null;

  const positiveFidRow = rows.find((row) => row.fid > 0);
  if (positiveFidRow) return positiveFidRow;

  return rows
    .slice()
    .sort((a, b) => {
      const aToby = BigInt(safeAtomic(a.total_toby_atomic));
      const bToby = BigInt(safeAtomic(b.total_toby_atomic));

      if (aToby !== bToby) return bToby > aToby ? 1 : -1;

      return safeNumber(b.total_hops) - safeNumber(a.total_hops);
    })[0] ?? null;
}

export async function readCanonicalIdentity(): Promise<CanonicalIdentity | null> {
  const session = await readAppSession();
  if (!session) return null;

  const fid =
    typeof session.fid === 'number' &&
    Number.isSafeInteger(session.fid) &&
    session.fid > 0
      ? session.fid
      : null;

  const sessionWallet = normalizeAddress(session.address);

  const [fidUser, walletUser] = await Promise.all([
    fid ? loadByFid(fid) : Promise.resolve(null),
    sessionWallet ? loadByWallet(sessionWallet) : Promise.resolve(null),
  ]);

  const user = mergeRows(
    fid,
    sessionWallet,
    fidUser,
    walletUser,
  );

  const wallet =
    sessionWallet ??
    normalizeAddress(user?.wallet_address);

  const authMethod: CanonicalAuthMethod =
    session.authMethod === 'siwe'
      ? 'siwe'
      : fid
        ? 'farcaster'
        : 'siwe';

  return {
    authMethod,
    fid,
    wallet,
    user,
  };
}

export async function requireCanonicalIdentity(): Promise<CanonicalIdentity> {
  const identity = await readCanonicalIdentity();

  if (!identity) {
    throw new Error('Authentication required.');
  }

  return identity;
}

export function requireRequestedHopWallet(
  identity: CanonicalIdentity,
  requestedWallet: string,
): Address {
  if (!isAddress(requestedWallet)) {
    throw new Error('Invalid wallet.');
  }

  const wallet = getAddress(requestedWallet);

  if (identity.authMethod === 'siwe') {
    if (
      !identity.wallet ||
      identity.wallet.toLowerCase() !== wallet.toLowerCase()
    ) {
      throw new Error(
        'The requested wallet does not match the authenticated session.',
      );
    }

    return wallet;
  }

  if (!identity.fid || identity.fid <= 0) {
    throw new Error('A valid Farcaster identity is required.');
  }

  /*
   * A Farcaster custody address and the active Mini App wallet may differ.
   * The verify route must prove that this requested wallet sent the Base
   * transaction before awarding the hop.
   */
  return wallet;
}
