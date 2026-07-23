'use client';

import { sdk } from '@farcaster/miniapp-sdk';
import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSendTransaction,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';
import { base } from 'wagmi/chains';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BottomNav, type TobyHopView } from '@/components/toby-hop/BottomNav';
import { LeaderboardPanel, type LeaderRowWithWallet } from '@/components/toby-hop/LeaderboardPanel';
import { MePanel } from '@/components/toby-hop/MePanel';
import { NoticeCard } from '@/components/toby-hop/NoticeCard';
import { erc20Abi, HOP_USDC_ATOMIC, USDC_ADDRESS } from '@/lib/contracts';
import { compactNumber, formatAtomic } from '@/lib/format';
import { getTodaysPond, type PondParticle } from '@/lib/todays-pond';
import type { HopReceipt, HopUser, LeaderboardKind } from '@/lib/types';
import {
  addressesMatch,
  EMPTY_USER,
  FALLBACK_PFP,
  getErrorMessage,
  isSessionError,
  normalizeUser,
  parseApiError,
  safeAtomicString,
  shortenAddress,
  type AuthMethod,
  type HostMode,
  type MiniAppUser,
  type Notice,
  type SessionResponse,
  type StoredHopUser,
} from '@/lib/toby-hop-ui';

type HopState = 'idle' | 'connecting' | 'authenticating-farcaster' | 'signing-in' | 'quoting' | 'approving' | 'swapping' | 'confirming' | 'verifying';
type QuoteResponse = { allowanceTarget: Address; buyAmount: string; transaction: { to: Address; data: Hex; value?: string; gas?: string } };
type MiniAppContextResult = { user: MiniAppUser | null; added: boolean; available: boolean };

const API_TIMEOUT_MS = 15_000;
const SDK_TIMEOUT_MS = 3_000;
const CONNECT_TIMEOUT_MS = 30_000;
const TRANSACTION_TIMEOUT_MS = 120_000;
const VERIFICATION_TIMEOUT_MS = 150_000;
const INITIALIZATION_FALLBACK_MS = 12_000;

function isFarcasterConnector(connector: { id: string; name: string }): boolean {
  const value = `${connector.id} ${connector.name}`.toLowerCase();
  return value.includes('farcaster') || value.includes('miniapp') || value.includes('mini app');
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (cause) => { window.clearTimeout(timer); reject(cause); },
    );
  });
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init.signal ?? controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function readJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const raw = await response.text();
  if (!response.ok) throw new Error(parseApiError(raw, fallbackError));
  if (!raw.trim()) throw new Error(fallbackError);
  try { return JSON.parse(raw) as T; } catch { throw new Error(fallbackError); }
}

async function getSafeMiniAppContext(): Promise<MiniAppContextResult> {
  try {
    const context = await withTimeout(Promise.resolve(sdk.context), SDK_TIMEOUT_MS, 'Farcaster context timed out.');
    if (!context || typeof context !== 'object') return { user: null, added: false, available: false };
    const typed = context as { user?: MiniAppUser; client?: { added?: boolean } };
    const user = typed.user && typeof typed.user.fid === 'number' && typed.user.fid > 0 ? typed.user : null;
    return { user, added: Boolean(typed.client?.added), available: Boolean(user) };
  } catch {
    return { user: null, added: false, available: false };
  }
}

function particleSymbol(type: PondParticle): string {
  if (type === 'petal') return '🌸';
  if (type === 'snow') return '•';
  if (type === 'leaf') return '🍂';
  return '';
}

export function TobyHopApp() {
  const [view, setView] = useState<TobyHopView>('hop');
  const [hostMode, setHostMode] = useState<HostMode>('checking');
  const [user, setUser] = useState<HopUser>(EMPTY_USER);
  const [authenticated, setAuthenticated] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [authenticatedAddress, setAuthenticatedAddress] = useState<Address | null>(null);
  const [authenticatedFid, setAuthenticatedFid] = useState<number | null>(null);
  const [farcasterUser, setFarcasterUser] = useState<MiniAppUser | null>(null);
  const [farcasterAvailable, setFarcasterAvailable] = useState(false);
  const [miniAppAdded, setMiniAppAdded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hopState, setHopState] = useState<HopState>('idle');
  const [receipt, setReceipt] = useState<HopReceipt | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [leaderKind, setLeaderKind] = useState<LeaderboardKind>('streak');
  const [leaders, setLeaders] = useState<LeaderRowWithWallet[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);
  const [farcasterAuthLoading, setFarcasterAuthLoading] = useState(false);

  const browserAuthRef = useRef(false);
  const farcasterAuthRef = useRef(false);
  const hopInProgressRef = useRef(false);
  const leaderboardRequestRef = useRef(0);

  const todaysPond = useMemo(() => getTodaysPond(), []);
  const particles = useMemo(() => {
    if (!todaysPond.particle) return [];
    return Array.from({ length: todaysPond.particleCount }, (_, index) => ({
      id: `${todaysPond.particle}-${index}`,
      type: todaysPond.particle!,
      left: 4 + ((index * 37 + 11) % 92),
      delay: ((index * 23) % 31) / 10,
      duration: 3.4 + ((index * 17) % 25) / 10,
      scale: 0.65 + ((index * 13) % 9) / 10,
    }));
  }, [todaysPond]);

  const { address, chainId, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient({ chainId: base.id });

  const isFarcasterMiniApp = hostMode === 'farcaster';
  const busy = hopState !== 'idle';
  const walletMatchesSession = addressesMatch(address, authenticatedAddress);
  const displayName = user.display_name || user.username || farcasterUser?.displayName || farcasterUser?.username || shortenAddress(authenticatedAddress ?? address);
  const profilePfp = user.pfp_url || farcasterUser?.pfpUrl || FALLBACK_PFP;
  const canCast = isFarcasterMiniApp && Boolean(farcasterUser);
  const currentUserFid = authenticatedFid ?? farcasterUser?.fid ?? (user.fid > 0 ? user.fid : null);
  const currentLeaderboardEntry = useMemo(() => leaders.find((row) => {
    const fid = typeof row.fid === 'number' && row.fid > 0 ? row.fid : null;
    return addressesMatch(row.wallet_address, authenticatedAddress) || Boolean(fid && currentUserFid && fid === currentUserFid);
  }) ?? null, [authenticatedAddress, currentUserFid, leaders]);
  const actualRank = user.total_hops > 0 && currentLeaderboardEntry ? currentLeaderboardEntry.rank : null;

  const setErrorNotice = useCallback((cause: unknown, mode: HostMode = 'browser') => {
    setNotice({ kind: 'error', message: getErrorMessage(cause, mode) });
  }, []);

  const resetAppSession = useCallback((fcUser: MiniAppUser | null = null) => {
    setAuthenticated(false);
    setAuthMethod(null);
    setAuthenticatedAddress(null);
    setAuthenticatedFid(fcUser?.fid ?? null);
    setUser(normalizeUser(undefined, fcUser));
  }, []);

  const applySessionResult = useCallback((result: SessionResponse, fcUser: MiniAppUser | null = null): boolean => {
    if (!result.authenticated) { resetAppSession(fcUser); return false; }
    const normalizedAddress = result.address && isAddress(result.address) ? getAddress(result.address) : null;
    const responseFid = typeof result.fid === 'number' && result.fid > 0 ? result.fid : null;
    const dbFid = typeof result.user?.fid === 'number' && result.user.fid > 0 ? result.user.fid : null;
    const contextFid = typeof fcUser?.fid === 'number' && fcUser.fid > 0 ? fcUser.fid : null;
    const sessionFid = responseFid ?? dbFid ?? contextFid;
    setAuthenticated(true);
    setAuthMethod(result.authMethod ?? (sessionFid ? 'farcaster' : normalizedAddress ? 'siwe' : null));
    setAuthenticatedAddress(normalizedAddress);
    setAuthenticatedFid(sessionFid);
    setUser(normalizeUser(result.user, fcUser));
    return true;
  }, [resetAppSession]);

  const loadAppSession = useCallback(async (fcUser: MiniAppUser | null = null): Promise<boolean> => {
    const response = await fetchWithTimeout('/api/auth/session', { method: 'GET', credentials: 'include', cache: 'no-store' });
    return applySessionResult(await readJsonResponse<SessionResponse>(response, 'Unable to check your Toby Hop session.'), fcUser);
  }, [applySessionResult]);

  const authenticateWithFarcaster = useCallback(async (miniUser: MiniAppUser, walletAddress: Address | null = null): Promise<SessionResponse | null> => {
    if (!miniUser.fid || miniUser.fid <= 0) throw new Error('Invalid Farcaster user.');
    if (farcasterAuthRef.current) return null;
    farcasterAuthRef.current = true;
    setFarcasterAuthLoading(true);
    try {
      const response = await withTimeout(sdk.quickAuth.fetch('/api/auth/farcaster', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: miniUser.username ?? null, displayName: miniUser.displayName ?? null, pfpUrl: miniUser.pfpUrl ?? null, walletAddress }),
      }), API_TIMEOUT_MS, 'Farcaster authentication timed out.');
      const result = await readJsonResponse<SessionResponse>(response, 'Farcaster authentication failed.');
      if (!result.authenticated) throw new Error(result.error || result.message || 'Farcaster authentication failed.');
      applySessionResult(result, miniUser);
      return result;
    } finally {
      farcasterAuthRef.current = false;
      setFarcasterAuthLoading(false);
    }
  }, [applySessionResult]);

  const syncProfile = useCallback(async (miniUser: MiniAppUser) => {
    try {
      const response = await fetchWithTimeout('/api/me', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: miniUser.username ?? null, displayName: miniUser.displayName ?? null, pfpUrl: miniUser.pfpUrl ?? null }) });
      if (!response.ok) return;
      const raw = await response.text();
      if (raw.trim()) setUser(normalizeUser(JSON.parse(raw) as StoredHopUser, miniUser));
    } catch { /* optional */ }
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        setNotice(null);
        try { await withTimeout(sdk.actions.ready(), SDK_TIMEOUT_MS, 'Farcaster ready timed out.'); } catch { /* browser */ }
        const context = await getSafeMiniAppContext();
        if (!active) return;
        const detected: HostMode = context.available && context.user?.fid ? 'farcaster' : 'browser';
        setHostMode(detected);
        setFarcasterUser(context.user);
        setFarcasterAvailable(detected === 'farcaster');
        setMiniAppAdded(context.added);
        try { await loadAppSession(context.user); } catch { resetAppSession(context.user); }
        // Important: do not auto-create a Farcaster database row on app open.
      } catch (cause) {
        if (active) { setHostMode('browser'); setErrorNotice(cause, 'browser'); }
      } finally { if (active) setLoading(false); }
    }
    void initialize();
    return () => { active = false; };
  }, [loadAppSession, resetAppSession, setErrorNotice]);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => {
      setLoading(false);
      setHostMode((current) => current === 'checking' ? 'browser' : current);
      setNotice((current) => current ?? { kind: 'error', message: 'The pond took too long to open. You can still retry.' });
    }, INITIALIZATION_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => { if (authenticated && farcasterUser) void syncProfile(farcasterUser); }, [authenticated, farcasterUser, syncProfile]);

  useEffect(() => {
    if (hostMode !== 'browser' || !authenticated || authMethod !== 'siwe' || !authenticatedAddress || !address || addressesMatch(address, authenticatedAddress)) return;
    resetAppSession(null);
    setNotice({ kind: 'error', message: 'The connected wallet changed. Sign in again to protect your pond record.' });
  }, [address, authenticated, authenticatedAddress, authMethod, hostMode, resetAppSession]);

  const loadLeaderboard = useCallback(async (kind: LeaderboardKind) => {
    const requestId = ++leaderboardRequestRef.current;
    setLeaderLoading(true);
    try {
      const response = await fetchWithTimeout(`/api/leaderboard?kind=${encodeURIComponent(kind)}`, { method: 'GET', cache: 'no-store' });
      const rows = await readJsonResponse<LeaderRowWithWallet[]>(response, 'Unable to load the leaderboard.');
      if (leaderboardRequestRef.current === requestId) setLeaders(Array.isArray(rows) ? rows : []);
    } catch (cause) {
      if (leaderboardRequestRef.current === requestId) setErrorNotice(cause);
    } finally {
      if (leaderboardRequestRef.current === requestId) setLeaderLoading(false);
    }
  }, [setErrorNotice]);

  useEffect(() => { if (view === 'leaders') void loadLeaderboard(leaderKind); }, [leaderKind, loadLeaderboard, view]);

  async function provideTapFeedback() {
    if (!farcasterAvailable) return;
    try {
      const capabilities = await withTimeout(sdk.getCapabilities(), SDK_TIMEOUT_MS, 'Capabilities timed out.');
      if (capabilities.includes('haptics.impactOccurred')) await sdk.haptics.impactOccurred('medium');
    } catch { /* optional */ }
  }

  function chooseConnector() {
    if (!connectors.length) return null;
    if (isFarcasterMiniApp) {
      const fc = connectors.find(isFarcasterConnector);
      if (fc) return fc;
    }
    return connectors.find((connector) => connector.id === 'injected' || `${connector.id} ${connector.name}`.toLowerCase().includes('injected')) ?? connectors[0];
  }

  async function getConnectedWallet(): Promise<Address> {
    if (isConnected && address) return getAddress(address);
    setHopState('connecting');
    const connector = chooseConnector();
    if (!connector) throw new Error(isFarcasterMiniApp ? 'No Farcaster wallet connector was found.' : 'No compatible wallet connector was found.');
    const connection = await withTimeout(connectAsync({ connector, chainId: base.id }), CONNECT_TIMEOUT_MS, 'Wallet connection timed out.');
    const wallet = connection.accounts[0];
    if (!wallet || !isAddress(wallet)) throw new Error('No Base wallet was returned.');
    return getAddress(wallet);
  }

  async function ensureBaseChain() {
    if (chainId === base.id) return;
    try { await switchChainAsync({ chainId: base.id }); } catch (cause) { if (!isFarcasterMiniApp) throw cause; }
  }

  async function signInWithWallet(): Promise<Address | null> {
    if (browserAuthRef.current) return null;
    browserAuthRef.current = true;
    setNotice(null);
    try {
      const wallet = await getConnectedWallet();
      setHopState('signing-in');
      await ensureBaseChain();
      const nonceResponse = await fetchWithTimeout('/api/auth/nonce', { method: 'GET', credentials: 'include', cache: 'no-store' });
      const nonceResult = await readJsonResponse<{ nonce?: string }>(nonceResponse, 'Unable to create a sign-in request.');
      if (!nonceResult.nonce) throw new Error('The server did not return a sign-in nonce.');
      const message = createSiweMessage({ address: wallet, chainId: base.id, domain: window.location.host, uri: window.location.origin, version: '1', nonce: nonceResult.nonce, statement: 'Sign in to Toby Hop and protect your daily pond record.', issuedAt: new Date() });
      const signature = await signMessageAsync({ message });
      const verifyResponse = await fetchWithTimeout('/api/auth/verify', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, signature }) });
      const result = await readJsonResponse<SessionResponse>(verifyResponse, 'Wallet authentication failed.');
      if (!result.authenticated || !result.address || !isAddress(result.address)) throw new Error(result.error || 'Wallet authentication failed.');
      const verified = getAddress(result.address);
      if (!addressesMatch(wallet, verified)) throw new Error('The authenticated wallet did not match the connected wallet.');
      applySessionResult({ ...result, authMethod: 'siwe', address: verified }, null);
      return verified;
    } catch (cause) { setErrorNotice(cause, 'browser'); return null; }
    finally { browserAuthRef.current = false; setHopState('idle'); }
  }

  async function ensureFarcasterHopSession(wallet: Address): Promise<boolean> {
    if (!farcasterUser) throw new Error('Farcaster user context is unavailable.');
    if (authenticated && authMethod === 'farcaster' && addressesMatch(authenticatedAddress, wallet)) return true;
    setHopState('authenticating-farcaster');
    const result = await authenticateWithFarcaster(farcasterUser, wallet);
    return Boolean(result?.authenticated && result.address && addressesMatch(result.address, wallet));
  }

  async function retryFarcasterAuthentication() {
    if (!farcasterUser) { setNotice({ kind: 'error', message: 'Farcaster context is unavailable. Close and reopen Toby Hop.' }); return; }
    setNotice(null);
    try { await authenticateWithFarcaster(farcasterUser, address && isAddress(address) ? getAddress(address) : null); }
    catch (cause) { setErrorNotice(cause, 'farcaster'); }
  }

  async function logoutWallet() {
    if (isFarcasterMiniApp) return;
    try { await fetchWithTimeout('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch { /* clear locally */ }
    resetAppSession(null); setReceipt(null); setLeaders([]); disconnect();
  }

  async function ensureUsdcAllowance(wallet: Address, allowanceTarget: Address) {
    if (!publicClient) throw new Error('The Base network client is unavailable.');
    const allowance = await publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [wallet, allowanceTarget] });
    if (BigInt(allowance) >= BigInt(HOP_USDC_ATOMIC)) return;
    setHopState('approving');
    const hash = await writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [allowanceTarget, HOP_USDC_ATOMIC], chainId: base.id });
    const result = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: TRANSACTION_TIMEOUT_MS });
    if (result.status !== 'success') throw new Error('The USDC approval transaction failed.');
  }

  async function performHop() {
    if (hopInProgressRef.current || busy || user.today_hopped) return;
    hopInProgressRef.current = true;
    setNotice(null);
    await provideTapFeedback();
    try {
      const wallet = await getConnectedWallet();
      await ensureBaseChain();
      if (isFarcasterMiniApp) {
        if (!(await ensureFarcasterHopSession(wallet))) throw new Error('Farcaster authentication did not link the connected wallet.');
      } else if (!authenticated || authMethod !== 'siwe' || !walletMatchesSession) {
        const signedIn = await signInWithWallet();
        if (!signedIn) return;
        if (!addressesMatch(wallet, signedIn)) throw new Error('The connected wallet does not match the signed-in wallet.');
      }

      setHopState('quoting');
      const quote = await readJsonResponse<QuoteResponse>(await fetchWithTimeout(`/api/hop/quote?wallet=${encodeURIComponent(wallet)}`, { method: 'GET', credentials: 'include', cache: 'no-store' }), 'Unable to prepare today’s hop.');
      if (!isAddress(quote.allowanceTarget) || !isAddress(quote.transaction.to) || !quote.transaction.data?.startsWith('0x')) throw new Error('The hop quote returned invalid transaction data.');
      await ensureUsdcAllowance(wallet, getAddress(quote.allowanceTarget));

      setHopState('swapping');
      const transactionHash = await sendTransactionAsync({ to: getAddress(quote.transaction.to), data: quote.transaction.data, value: BigInt(quote.transaction.value ?? '0'), gas: quote.transaction.gas ? BigInt(quote.transaction.gas) : undefined, chainId: base.id });
      if (!publicClient) throw new Error('The Base network client is unavailable.');
      setHopState('confirming');
      const swap = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 1, timeout: TRANSACTION_TIMEOUT_MS });
      if (swap.status !== 'success') throw new Error('The hop transaction failed.');

      setHopState('verifying');
      const completed = await readJsonResponse<HopReceipt>(await fetchWithTimeout('/api/hop/verify', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: transactionHash, walletAddress: wallet }) }, VERIFICATION_TIMEOUT_MS), 'Unable to verify the completed hop.');
      setReceipt(completed);
      setUser((previous) => ({ ...previous, today_hopped: true, total_hops: completed.totalHops, current_streak: completed.streak, longest_streak: Math.max(previous.longest_streak, completed.streak), big_pond_energy: previous.big_pond_energy + 1, current_title: completed.title, total_toby_atomic: (BigInt(safeAtomicString(previous.total_toby_atomic)) + BigInt(completed.tobyAtomic)).toString() }));
      setNotice({ kind: 'success', message: 'Today’s hop is safely recorded.' });
      try { await loadAppSession(farcasterUser); } catch { /* optimistic state */ }
      try { await loadLeaderboard(leaderKind); } catch { /* optional */ }
      if (farcasterAvailable) try { await sdk.haptics.notificationOccurred('success'); } catch { /* optional */ }
      if (farcasterUser && !miniAppAdded) try { await withTimeout(sdk.actions.addMiniApp(), SDK_TIMEOUT_MS * 2, 'Add Mini App timed out.'); setMiniAppAdded(true); } catch { /* optional */ }
    } catch (cause) {
      const message = getErrorMessage(cause, hostMode);
      setNotice({ kind: 'error', message });
      if (isSessionError(message)) { if (isFarcasterMiniApp) { setAuthenticated(false); setAuthenticatedAddress(null); setAuthMethod(null); } else resetAppSession(null); }
      if (farcasterAvailable) try { await sdk.haptics.notificationOccurred('error'); } catch { /* optional */ }
    } finally { hopInProgressRef.current = false; setHopState('idle'); }
  }

  async function shareHop() {
    if (!receipt) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    if (canCast) try { await withTimeout(sdk.actions.composeCast({ text: receipt.castText, embeds: [appUrl] }), SDK_TIMEOUT_MS * 4, 'Cast composer timed out.'); return; } catch { /* fallback */ }
    try {
      if (navigator.share) { await navigator.share({ title: 'Toby Hop', text: receipt.castText, url: appUrl }); return; }
      await navigator.clipboard.writeText(`${receipt.castText}\n\n${appUrl}`);
      setNotice({ kind: 'success', message: 'Your hop message was copied.' });
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setErrorNotice(cause); }
  }

  const hopStatus: Record<HopState, string> = {
    idle: authenticated ? 'Tap Toby to hop' : 'Tap Toby to join the pond',
    connecting: isFarcasterMiniApp ? 'Opening your Farcaster wallet' : 'Connecting your wallet',
    'authenticating-farcaster': 'Linking your Farcaster pond record',
    'signing-in': 'Protecting your pond record',
    quoting: 'Finding today’s route',
    approving: 'Approving one cent of USDC',
    swapping: 'Toby is hopping',
    confirming: 'Waiting for the ripple',
    verifying: 'Counting your hop',
  };
  const hopSubtext: Record<HopState, string> = {
    idle: authenticated ? 'One cent USDC to TOBY' : isFarcasterMiniApp ? 'Your record is created only when you hop' : 'Connect and sign in with a Base wallet',
    connecting: isFarcasterMiniApp ? 'Using your Farcaster wallet' : 'Choose a Base wallet',
    'authenticating-farcaster': 'Verifying your Farcaster identity',
    'signing-in': 'Sign once to protect your progress',
    quoting: 'Preparing one cent USDC to TOBY',
    approving: 'Confirm the USDC approval',
    swapping: 'Confirm today’s hop',
    confirming: 'Waiting for Base confirmation',
    verifying: 'Recording your verified hop',
  };
  const connectButtonText = hopState === 'signing-in' ? 'SIGNING IN' : hopState === 'connecting' || connectPending ? 'CONNECTING' : 'CONNECT WALLET';

  if (loading) return <main className="shell"><div className="empty" role="status" aria-live="polite"><strong>Opening the pond</strong><span>Waking Toby up…</span></div></main>;

  return <main className={['shell', `pond-theme-${todaysPond.id}`, todaysPond.goldenToby ? 'golden-toby-day' : '', busy ? 'hop-is-busy' : '', isFarcasterMiniApp ? 'host-farcaster' : 'host-browser'].filter(Boolean).join(' ')}>
    <header className="topbar">
      <div><div className="brand">TOBY HOP</div><div className="tagline">One hop. Every day.</div></div>
      {!isFarcasterMiniApp && isConnected && address && <button type="button" className="wallet-pill" onClick={authenticated ? logoutWallet : signInWithWallet} disabled={busy}><span className={['wallet-dot', authenticated ? 'connected' : ''].filter(Boolean).join(' ')} />{shortenAddress(address)}</button>}
      {isFarcasterMiniApp && <div className="wallet-pill"><span className={['wallet-dot', authenticated ? 'connected' : ''].filter(Boolean).join(' ')} />Farcaster</div>}
    </header>

    {view !== 'leaders' && <section className="profile"><img className="pfp" src={profilePfp} alt={`${displayName} profile`} /><div className="profile-identity"><div className="profile-name">{displayName}</div><div className="profile-title">{authenticated ? user.current_title : isFarcasterMiniApp ? 'Ready to hop' : 'New to the Pond'}</div></div><div className="streak-pill"><div className="streak-number">{user.current_streak}</div><div className="streak-label">day streak</div></div></section>}

    {!authenticated && !isFarcasterMiniApp && view === 'hop' && <section className="empty-state-card join-pond-card"><div className="join-pond-icon">🐸</div><div><strong>Join the pond</strong><p>Connect a Base wallet and sign once to save your progress.</p></div><button type="button" className="primary" onClick={signInWithWallet} disabled={busy || connectPending}>{connectButtonText}</button></section>}
    {!authenticated && isFarcasterMiniApp && view === 'hop' && <section className="empty-state-card join-pond-card"><div className="join-pond-icon">🐸</div><div><strong>Ready for your first hop</strong><p>Your Farcaster profile is visible now, but your pond record is not created until you tap Toby.</p></div></section>}

    {view === 'hop' && <>
      <section className="todays-pond-card"><span className="today-label">TODAY’S POND</span><strong>{todaysPond.emoji} {todaysPond.name}</strong><span>{todaysPond.description}</span></section>
      <section className={['pond-card', busy ? 'pond-card-busy' : ''].filter(Boolean).join(' ')}>
        <div className="hop-copy"><h1>{user.today_hopped ? 'The ripple remains' : 'Ready to hop'}</h1><p>{user.today_hopped ? 'Return tomorrow for another hop' : 'Exchange one small drop for TOBY'}</p></div>
        <div className={`moon moon-${todaysPond.moonPhase}`} />
        {todaysPond.id === 'rainbow' && <div className="pond-rainbow" />}
        {todaysPond.id === 'shooting-star' && <div className="shooting-star" />}
        {todaysPond.id === 'lotus' && <><div className="lotus-bloom lotus-bloom-one">🪷</div><div className="lotus-bloom lotus-bloom-two">🪷</div></>}
        <div className="pond-particles" aria-hidden="true">{particles.map((p) => <span key={p.id} className={`pond-particle particle-${p.type}`} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, transform: `scale(${p.scale})` }}>{particleSymbol(p.type)}</span>)}</div>
        <div className="reed r1" /><div className="reed r2" /><div className="reed r3" /><div className="water" /><div className="ripple ripple-one" /><div className="ripple ripple-two" /><div className="ripple ripple-three" /><div className="lily l1" /><div className="lily l2" />
        <button type="button" className="frog-button" disabled={busy || user.today_hopped} onClick={performHop} aria-label={user.today_hopped ? 'Today’s hop is complete' : 'Tap Toby to hop'}>
          <div className={['frog', busy ? 'hopping' : '', user.today_hopped ? 'frog-resting' : ''].filter(Boolean).join(' ')}><div className="frog-body" /><div className="eye left" /><div className="eye right" /><div className="mouth" /><div className="cheek c1" /><div className="cheek c2" />{todaysPond.goldenToby && <div className="golden-crown">👑</div>}</div>
          {!busy && !user.today_hopped && <div className="tap-ring" />}
        </button>
        <div className="hop-instruction" aria-live="polite"><strong>{user.today_hopped ? 'Today’s hop is complete' : hopStatus[hopState]}</strong><span>{user.today_hopped ? 'One Big Pond Energy collected' : hopSubtext[hopState]}</span></div>
        {busy && <div className="hop-progress" role="status"><span className="hop-progress-dot" /><span>Keep Toby Hop open</span></div>}
      </section>
      <section className="stat-grid"><div className="stat"><strong>{compactNumber(user.big_pond_energy)}</strong><span>Big Pond Energy</span></div><div className="stat"><strong>{compactNumber(user.total_hops)}</strong><span>Hops</span></div><div className="stat"><strong>{formatAtomic(user.total_toby_atomic)}</strong><span>TOBY</span></div></section>
    </>}

    {view === 'leaders' && <LeaderboardPanel authenticated={authenticated} authenticatedAddress={authenticatedAddress} currentUserFid={currentUserFid} kind={leaderKind} loading={leaderLoading} rows={leaders} onKindChange={setLeaderKind} />}
    {view === 'me' && <MePanel authenticated={authenticated} isFarcasterMiniApp={isFarcasterMiniApp} farcasterAuthLoading={farcasterAuthLoading} busy={busy} displayName={displayName} user={user} profilePfp={profilePfp} rank={actualRank} connectButtonText={connectButtonText} onWalletSignIn={() => void signInWithWallet()} onFarcasterRetry={() => void retryFarcasterAuthentication()} onWalletLogout={() => void logoutWallet()} />}

    <NoticeCard notice={notice} onDismiss={() => setNotice(null)} />
    <BottomNav view={view} pfpUrl={profilePfp} onChange={setView} />

    {receipt && <div className="success" role="dialog" aria-modal="true" aria-label="Hop complete"><div className="success-card"><div className="success-frog">🐸</div><div className="success-eyebrow">HOP COMPLETE</div><div className="energy">+1 BIG POND ENERGY</div><div className="success-summary"><strong>{receipt.tobyDisplay} TOBY</strong><span>{receipt.streak} day streak</span>{receipt.dailyPosition > 0 && <span>Hopper #{receipt.dailyPosition} today</span>}</div><div className="success-actions"><button type="button" className="primary" onClick={shareHop}>{canCast ? 'CAST MY HOP' : 'SHARE MY HOP'}</button><button type="button" className="secondary" onClick={() => setReceipt(null)}>BACK TO THE POND</button></div></div></div>}
  </main>;
}
