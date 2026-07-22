'use client';

import { sdk } from '@farcaster/miniapp-sdk';
import { useEffect, useMemo, useState } from 'react';
import { useAccount, useConnect, useSendTransaction, useWriteContract } from 'wagmi';
import { erc20Abi, USDC_ADDRESS } from '@/lib/contracts';
import { formatAtomic, compactNumber } from '@/lib/format';
import type { HopReceipt, HopUser, LeaderRow, LeaderboardKind } from '@/lib/types';

type View = 'hop' | 'leaders' | 'me';
type Quote = {
  allowanceTarget: `0x${string}`;
  transaction: { to: `0x${string}`; data: `0x${string}`; value: string; gas?: string };
  buyAmount: string;
};

const fallbackPfp = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="100%" height="100%" rx="48" fill="#0b4345"/><text x="50%" y="57%" text-anchor="middle" font-size="44">🐸</text></svg>`
);

export function TobyHopApp() {
  const [view, setView] = useState<View>('hop');
  const [user, setUser] = useState<HopUser | null>(null);
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [hopState, setHopState] = useState<'idle'|'quoting'|'approving'|'swapping'|'verifying'>('idle');
  const [receipt, setReceipt] = useState<HopReceipt | null>(null);
  const [error, setError] = useState('');
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [leaderKind, setLeaderKind] = useState<LeaderboardKind>('streak');
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  async function authFetch(path: string, init?: RequestInit) {
    if (!token) throw new Error('Farcaster session is unavailable.');
    return fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init?.headers || {}) }
    });
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await sdk.actions.ready();
        const [session, context] = await Promise.all([sdk.quickAuth.getToken(), sdk.context]);
        if (!active) return;
        setToken(session.token);
        const response = await fetch('/api/me', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
          body: JSON.stringify({
            username: context.user.username,
            displayName: context.user.displayName,
            pfpUrl: context.user.pfpUrl
          })
        });
        if (!response.ok) throw new Error(await response.text());
        setUser(await response.json());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to open Toby Hop.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!token || view !== 'leaders') return;
    authFetch(`/api/leaderboard?kind=${leaderKind}`)
      .then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); })
      .then(setLeaders)
      .catch(e => setError(e.message));
  }, [token, view, leaderKind]);

  const busy = hopState !== 'idle';
  const displayName = user?.display_name || user?.username || 'Hopper';

  async function performHop() {
    setError('');
    if (user?.today_hopped) return;
    try {
      setHopState('quoting');
      let wallet = address;
      if (!isConnected || !wallet) {
        const connector = connectors[0];
        if (!connector) throw new Error('No compatible wallet is available.');
        const connected = await connectAsync({ connector });
        wallet = connected.accounts[0];
      }

      const qRes = await authFetch(`/api/hop/quote?wallet=${wallet}`);
      if (!qRes.ok) throw new Error(await qRes.text());
      const quote = await qRes.json() as Quote;

      setHopState('approving');
      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [quote.allowanceTarget, 10_000n]
      });

      setHopState('swapping');
      const txHash = await sendTransactionAsync({
        to: quote.transaction.to,
        data: quote.transaction.data,
        value: BigInt(quote.transaction.value || '0'),
        gas: quote.transaction.gas ? BigInt(quote.transaction.gas) : undefined
      });

      setHopState('verifying');
      const verify = await authFetch('/api/hop/verify', {
        method: 'POST',
        body: JSON.stringify({ txHash, walletAddress: wallet })
      });
      if (!verify.ok) throw new Error(await verify.text());
      const completed = await verify.json() as HopReceipt;
      setReceipt(completed);
      try {
        const context = await sdk.context;
        if (!context.client.added) await sdk.actions.addMiniApp();
      } catch {
        // The hop still succeeds if the host does not support or the user declines addMiniApp.
      }
      setUser(prev => prev ? {
        ...prev,
        today_hopped: true,
        total_hops: completed.totalHops,
        current_streak: completed.streak,
        longest_streak: Math.max(prev.longest_streak, completed.streak),
        big_pond_energy: prev.big_pond_energy + 1,
        current_title: completed.title,
        total_toby_atomic: (BigInt(prev.total_toby_atomic) + BigInt(completed.tobyAtomic)).toString()
      } : prev);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The hop did not complete.');
    } finally {
      setHopState('idle');
    }
  }

  async function castHop() {
    if (!receipt) return;
    await sdk.actions.composeCast({
      text: receipt.castText,
      embeds: [process.env.NEXT_PUBLIC_APP_URL || window.location.origin]
    });
  }

  const buttonText = user?.today_hopped
    ? 'YOU HOPPED TODAY'
    : busy
      ? ({ quoting:'FINDING THE POND…', approving:'APPROVE 1¢ USDC…', swapping:'HOPPING…', verifying:'COUNTING THE HOP…' }[hopState] || 'HOPPING…')
      : 'HOP';

  if (loading) return <main className="shell"><div className="empty">Opening the pond…</div></main>;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">TOBY HOP</div>
          <div className="tagline">One hop. Every day.</div>
        </div>
      </header>

      {view !== 'leaders' && (
        <section className="profile">
          <img className="pfp" src={user?.pfp_url || fallbackPfp} alt="" />
          <div>
            <div className="profile-name">{displayName}</div>
            <div className="profile-title">{user?.current_title || 'First Hopper'}</div>
          </div>
          <div className="streak-pill">
            <div className="streak-number">{user?.current_streak ?? 0}</div>
            <div className="streak-label">day streak</div>
          </div>
        </section>
      )}

      {view === 'hop' && (
        <>
          <section className="pond-card">
            <div className="hop-copy"><h1>Ready to hop?</h1><p>Exchange one small drop for $TOBY.</p></div>
            <div className="moon" />
            <div className="reed r1" /><div className="reed r2" /><div className="reed r3" />
            <div className="water" /><div className="ripple" />
            <div className="lily l1" /><div className="lily l2" />
            <div className="frog-wrap">
              <div className={`frog ${busy ? 'hopping' : ''}`}>
                <div className="frog-body" />
                <div className="eye left" /><div className="eye right" />
                <div className="mouth" /><div className="cheek c1" /><div className="cheek c2" />
              </div>
            </div>
            <button className="hop-button" disabled={busy || Boolean(user?.today_hopped)} onClick={performHop}>
              {buttonText}
              <span className="cost">{user?.today_hopped ? '+1 Big Pond Energy collected' : 'Exchange $0.01 USDC → $TOBY'}</span>
            </button>
          </section>

          <section className="stat-grid">
            <div className="stat"><strong>{compactNumber(user?.big_pond_energy ?? 0)}</strong><span>Pond energy</span></div>
            <div className="stat"><strong>{compactNumber(user?.total_hops ?? 0)}</strong><span>Hops</span></div>
            <div className="stat"><strong>{formatAtomic(user?.total_toby_atomic ?? '0')}</strong><span>$TOBY</span></div>
          </section>
        </>
      )}

      {view === 'leaders' && (
        <section className="panel">
          <h1 className="panel-title">Pond leaders</h1>
          <div className="tabs">
            {(['streak','hops','toby'] as const).map(k => (
              <button key={k} className={leaderKind === k ? 'active' : ''} onClick={() => setLeaderKind(k)}>
                {k === 'toby' ? '$TOBY' : k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
          {leaders.map(row => (
            <div className="leader-row" key={row.fid}>
              <div className="rank">#{row.rank}</div>
              <img src={row.pfp_url || fallbackPfp} alt="" />
              <div><div className="leader-name">{row.display_name || row.username || `FID ${row.fid}`}</div><div className="leader-title">{row.current_title}</div></div>
              <div className="leader-value">
                {leaderKind === 'streak' ? row.current_streak : leaderKind === 'hops' ? row.total_hops : formatAtomic(row.total_toby_atomic)}
                <div className="leader-sub">{leaderKind === 'streak' ? 'days' : leaderKind === 'hops' ? 'hops' : '$TOBY'}</div>
              </div>
            </div>
          ))}
          {!leaders.length && <div className="empty">No verified hops yet.</div>}
        </section>
      )}

      {view === 'me' && (
        <section className="panel">
          <h1 className="panel-title">Your pond record</h1>
          <div className="stat-grid">
            <div className="stat"><strong>{user?.current_streak ?? 0}</strong><span>Current streak</span></div>
            <div className="stat"><strong>{user?.longest_streak ?? 0}</strong><span>Best streak</span></div>
            <div className="stat"><strong>{user?.rank ? `#${user.rank}` : '—'}</strong><span>Pond rank</span></div>
            <div className="stat"><strong>{user?.total_hops ?? 0}</strong><span>Total hops</span></div>
            <div className="stat"><strong>{user?.big_pond_energy ?? 0}</strong><span>Energy</span></div>
            <div className="stat"><strong>{formatAtomic(user?.total_toby_atomic ?? '0')}</strong><span>$TOBY</span></div>
          </div>
        </section>
      )}

      {error && <div className="error">{error}</div>}

      <nav className="nav">
        <button className={view === 'hop' ? 'active' : ''} onClick={() => setView('hop')}>Hop</button>
        <button className={view === 'leaders' ? 'active' : ''} onClick={() => setView('leaders')}>Leaders</button>
        <button className={view === 'me' ? 'active' : ''} onClick={() => setView('me')}>Me</button>
      </nav>

      {receipt && (
        <div className="success">
          <div className="success-card">
            <div>HOP COMPLETE</div>
            <div className="energy">+1 BIG POND ENERGY</div>
            <div>{receipt.tobyDisplay} $TOBY · {receipt.streak}-day streak</div>
            <div className="success-actions">
              <button className="primary" onClick={castHop}>CAST MY HOP</button>
              <button className="secondary" onClick={() => setReceipt(null)}>BACK TO THE POND</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
