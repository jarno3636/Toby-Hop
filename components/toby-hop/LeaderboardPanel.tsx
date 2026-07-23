import { formatAtomic } from '@/lib/format';
import type { LeaderboardKind, LeaderRow } from '@/lib/types';
import { FALLBACK_PFP, addressesMatch, isEligibleLeader, shortenAddress } from '@/lib/toby-hop-ui';

export type LeaderRowWithWallet = LeaderRow & { id?: string; wallet_address?: string | null };

type Props = {
  authenticated: boolean;
  authenticatedAddress: string | null;
  currentUserFid: number | null;
  kind: LeaderboardKind;
  loading: boolean;
  rows: LeaderRowWithWallet[];
  onKindChange: (kind: LeaderboardKind) => void;
};

export function LeaderboardPanel(props: Props) {
  const { authenticated, authenticatedAddress, currentUserFid, kind, loading, rows, onKindChange } = props;
  const eligibleRows = rows.filter(isEligibleLeader);
  const currentEntry = eligibleRows.find((row) => {
    const fid = typeof row.fid === 'number' && row.fid > 0 ? row.fid : null;
    return addressesMatch(row.wallet_address, authenticatedAddress) || Boolean(fid && currentUserFid && fid === currentUserFid);
  });

  return <section className="panel">
    <div className="panel-heading">
      <div><span className="panel-eyebrow">THE POND</span><h1 className="panel-title">Pond leaders</h1></div>
      {authenticated && <div className="your-rank-pill">{currentEntry ? `Your rank #${currentEntry.rank}` : 'Hop to join'}</div>}
    </div>
    <div className="tabs">
      {(['streak', 'hops', 'toby'] as const).map((leaderKind) => <button key={leaderKind} type="button" className={kind === leaderKind ? 'active' : ''} disabled={loading} onClick={() => onKindChange(leaderKind)}>{leaderKind === 'toby' ? 'TOBY' : leaderKind.charAt(0).toUpperCase() + leaderKind.slice(1)}</button>)}
    </div>
    {loading && <div className="empty" role="status"><strong>Reading the pond</strong><span>Gathering verified hoppers…</span></div>}
    {!loading && eligibleRows.map((row) => {
      const rowName = row.display_name || row.username || shortenAddress(row.wallet_address);
      const validFid = typeof row.fid === 'number' && row.fid > 0 ? row.fid : null;
      const isCurrentUser = addressesMatch(row.wallet_address, authenticatedAddress) || Boolean(validFid && currentUserFid && validFid === currentUserFid);
      const rowKey = row.id || row.wallet_address || (validFid ? `fid-${validFid}` : `${row.rank}-${rowName}`);
      return <div className={['leader-row', isCurrentUser ? 'leader-row-you' : '', row.rank <= 3 ? `leader-rank-${row.rank}` : ''].filter(Boolean).join(' ')} key={rowKey}>
        <div className="rank">{row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`}</div>
        <img src={row.pfp_url || FALLBACK_PFP} alt="" />
        <div className="leader-identity"><div className="leader-name">{rowName}{isCurrentUser && <span className="you-label">YOU</span>}</div><div className="leader-title">{row.current_title || 'Pond Hopper'}</div></div>
        <div className="leader-value">{kind === 'streak' ? row.current_streak : kind === 'hops' ? row.total_hops : formatAtomic(row.total_toby_atomic)}<div className="leader-sub">{kind === 'streak' ? 'days' : kind === 'hops' ? 'hops' : 'TOBY'}</div></div>
      </div>;
    })}
    {!loading && !eligibleRows.length && <div className="empty"><strong>The pond is quiet</strong><span>Complete the first verified hop to join.</span></div>}
  </section>;
}
