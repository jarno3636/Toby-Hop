import type { Address } from 'viem';
import type { HopUser } from '@/lib/types';

export type HostMode = 'checking' | 'farcaster' | 'browser';
export type AuthMethod = 'farcaster' | 'siwe' | null;
export type Notice = { kind: 'error' | 'info' | 'success'; message: string };
export type MiniAppUser = { fid?: number; username?: string; displayName?: string; pfpUrl?: string };
export type StoredHopUser = Partial<HopUser> & { id?: string; wallet_address?: string | null };
export type SessionResponse = {
  authenticated: boolean;
  authMethod?: AuthMethod;
  address?: Address | null;
  fid?: number | null;
  user?: StoredHopUser | null;
  error?: string;
  message?: string;
};

export const FALLBACK_PFP = 'data:image/svg+xml,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
<rect width="96" height="96" rx="48" fill="#083a3c"/>
<ellipse cx="48" cy="57" rx="31" ry="23" fill="#73d7b1"/>
<circle cx="31" cy="35" r="13" fill="#73d7b1"/><circle cx="65" cy="35" r="13" fill="#73d7b1"/>
<circle cx="31" cy="35" r="5" fill="#082f31"/><circle cx="65" cy="35" r="5" fill="#082f31"/>
<path d="M34 58 Q48 69 62 58" fill="none" stroke="#082f31" stroke-width="4" stroke-linecap="round"/>
<circle cx="27" cy="54" r="4" fill="#f3a6ad"/><circle cx="69" cy="54" r="4" fill="#f3a6ad"/>
</svg>`);

export const EMPTY_USER: HopUser = {
  fid: 0,
  username: null,
  display_name: 'Pond Hopper',
  pfp_url: null,
  current_title: 'New Hopper',
  total_hops: 0,
  current_streak: 0,
  longest_streak: 0,
  big_pond_energy: 0,
  total_toby_atomic: '0',
  total_usdc_atomic: '0',
  first_hop_at: null,
  last_hop_at: null,
  today_hopped: false,
  rank: null,
};

export function safeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function safeAtomicString(value: unknown): string {
  try { return BigInt(String(value ?? '0')).toString(); } catch { return '0'; }
}

export function normalizeUser(value?: StoredHopUser | null, farcasterUser?: MiniAppUser | null): HopUser {
  const dbFid = typeof value?.fid === 'number' && value.fid > 0 ? value.fid : null;
  const fcFid = typeof farcasterUser?.fid === 'number' && farcasterUser.fid > 0 ? farcasterUser.fid : null;
  return {
    fid: dbFid ?? fcFid ?? 0,
    username: value?.username ?? farcasterUser?.username ?? null,
    display_name: value?.display_name ?? farcasterUser?.displayName ?? farcasterUser?.username ?? 'Pond Hopper',
    pfp_url: value?.pfp_url ?? farcasterUser?.pfpUrl ?? null,
    current_title: value?.current_title ?? 'New Hopper',
    total_hops: safeNumber(value?.total_hops),
    current_streak: safeNumber(value?.current_streak),
    longest_streak: safeNumber(value?.longest_streak),
    big_pond_energy: safeNumber(value?.big_pond_energy),
    total_toby_atomic: safeAtomicString(value?.total_toby_atomic),
    total_usdc_atomic: safeAtomicString(value?.total_usdc_atomic),
    first_hop_at: value?.first_hop_at ?? null,
    last_hop_at: value?.last_hop_at ?? null,
    today_hopped: Boolean(value?.today_hopped),
    rank: value?.rank == null ? null : safeNumber(value.rank),
  };
}

export function parseApiError(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    return parsed.error || parsed.message || fallback;
  } catch { return raw.trim() || fallback; }
}

export function getErrorMessage(cause: unknown, hostMode: HostMode = 'browser'): string {
  if (!(cause instanceof Error)) return 'The pond could not complete this hop.';
  const original = cause.message?.trim() || 'The pond could not complete this hop.';
  const message = original.toLowerCase();
  if (message.includes('already linked')) return 'This wallet is already linked to another Farcaster account.';
  if (message.includes('audience') || message.includes('domain')) return 'Toby Hop could not validate the app domain. Close and reopen the Mini App.';
  if (message.includes('timeout') || message.includes('timed out') || message.includes('aborted')) return 'The pond took too long to respond. Please try again.';
  if (message.includes('rejected') || message.includes('denied')) return 'The request was cancelled.';
  if (message.includes('insufficient')) return 'You need at least one cent of USDC on Base and a small amount of ETH for gas.';
  if (message.includes('already hopped') || message.includes('already complete')) return 'You already completed today’s official hop.';
  if (message.includes('quick auth') || message.includes('invalid farcaster') || message.includes('farcaster authentication failed')) return 'Farcaster could not verify this session. Close and reopen Toby Hop, then retry.';
  if (message.includes('unauthorized') || message.includes('not authenticated') || message.includes('session expired') || message.includes('invalid session')) return hostMode === 'farcaster' ? 'Your Farcaster session expired. Tap retry to reconnect.' : 'Connect and sign in with your Base wallet to continue.';
  if (message.includes('wrong chain') || message.includes('unsupported chain')) return 'Switch your wallet to Base and try again.';
  if (message.includes('allowance') || message.includes('approval transaction failed')) return 'USDC approval did not complete. Please try the hop again.';
  if (message.includes('transaction reverted') || message.includes('transaction failed')) return 'The Base transaction did not complete. No hop was credited.';
  return original;
}

export function shortenAddress(address?: string | null): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Pond Hopper';
}
export function addressesMatch(a?: string | null, b?: string | null): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}
export function isSessionError(message: string): boolean {
  const value = message.toLowerCase();
  return value.includes('authentication') || value.includes('unauthorized') || value.includes('session expired') || value.includes('invalid session');
}
export function isEligibleLeader(row: { total_hops?: number | null; last_hop_at?: string | null }): boolean {
  return safeNumber(row.total_hops) > 0 && Boolean(row.last_hop_at);
}
