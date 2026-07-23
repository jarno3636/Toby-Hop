import { formatAtomic } from '@/lib/format';
import type { HopUser } from '@/lib/types';
import { FALLBACK_PFP } from '@/lib/toby-hop-ui';

type Props = {
  authenticated: boolean;
  isFarcasterMiniApp: boolean;
  farcasterAuthLoading: boolean;
  busy: boolean;
  displayName: string;
  user: HopUser;
  profilePfp?: string | null;
  rank: number | null;
  connectButtonText: string;
  onWalletSignIn: () => void;
  onFarcasterRetry: () => void;
  onWalletLogout: () => void;
};

export function MePanel(props: Props) {
  const { authenticated, isFarcasterMiniApp, farcasterAuthLoading, busy, displayName, user, profilePfp, rank, connectButtonText, onWalletSignIn, onFarcasterRetry, onWalletLogout } = props;
  const hasHopped = user.total_hops > 0;
  return <section className="panel">
    <div className="panel-heading"><div><span className="panel-eyebrow">HOPPER RECORD</span><h1 className="panel-title">Your pond record</h1></div></div>
    {!authenticated && !isFarcasterMiniApp && <div className="empty-state-card"><strong>Your record needs a wallet</strong><p>Connect and sign in to save your progress across devices.</p><button type="button" className="primary" onClick={onWalletSignIn} disabled={busy}>{connectButtonText}</button></div>}
    {!authenticated && isFarcasterMiniApp && <div className="empty-state-card"><strong>Ready to link your record</strong><p>Toby Hop creates your pond record only when you choose to link it or complete a hop.</p><button type="button" className="primary" onClick={onFarcasterRetry} disabled={farcasterAuthLoading || busy}>{farcasterAuthLoading ? 'LINKING PROFILE' : 'LINK FARCASTER'}</button></div>}
    {authenticated && <>
      <section className="record-hero"><img src={profilePfp || FALLBACK_PFP} alt="" /><div><strong>{displayName}</strong><span>{user.current_title || 'Pond Hopper'}</span></div><div className="record-rank">{hasHopped && rank ? `#${rank}` : '—'}<span>{hasHopped ? 'pond rank' : 'hop to rank'}</span></div></section>
      {!hasHopped && <div className="empty-state-card"><strong>Your first hop is waiting</strong><p>Complete one verified hop to enter the leaderboard.</p></div>}
      <div className="stat-grid profile-stats">
        <div className="stat"><strong>{user.current_streak}</strong><span>Current streak</span></div>
        <div className="stat"><strong>{user.longest_streak}</strong><span>Best streak</span></div>
        <div className="stat"><strong>{hasHopped && rank ? `#${rank}` : '—'}</strong><span>Pond rank</span></div>
        <div className="stat"><strong>{user.total_hops}</strong><span>Total hops</span></div>
        <div className="stat"><strong>{user.big_pond_energy}</strong><span>Big Pond Energy</span></div>
        <div className="stat"><strong>{formatAtomic(user.total_toby_atomic)}</strong><span>TOBY</span></div>
      </div>
      {!isFarcasterMiniApp && <button type="button" className="secondary sign-out-button" onClick={onWalletLogout} disabled={busy}>SIGN OUT WALLET</button>}
    </>}
  </section>;
}
