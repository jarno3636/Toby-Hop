import { formatAtomic } from '@/lib/format';
import type {
  LeaderboardKind,
  LeaderRow,
} from '@/lib/types';
import {
  FALLBACK_PFP,
  addressesMatch,
  shortenAddress,
} from '@/lib/toby-hop-ui';

export type LeaderRowWithWallet =
  LeaderRow & {
    id?: string;
    wallet_address?: string | null;
    last_hop_at?: string | null;
  };

type Props = {
  authenticated: boolean;
  authenticatedAddress: string | null;
  currentUserFid: number | null;
  kind: LeaderboardKind;
  loading: boolean;
  rows: LeaderRowWithWallet[];
  onKindChange: (
    kind: LeaderboardKind,
  ) => void;
};

function isEligibleLeader(
  row: LeaderRowWithWallet,
): boolean {
  return (
    Number(
      row.total_hops ?? 0,
    ) > 0 &&
    Boolean(
      row.last_hop_at,
    )
  );
}

function getValidFid(
  fid: LeaderRowWithWallet['fid'],
): number | null {
  return (
    typeof fid === 'number' &&
    fid > 0
  )
    ? fid
    : null;
}

function isMatchingUser(
  row: LeaderRowWithWallet,
  authenticatedAddress: string | null,
  currentUserFid: number | null,
): boolean {
  const rowFid =
    getValidFid(
      row.fid,
    );

  return (
    addressesMatch(
      row.wallet_address,
      authenticatedAddress,
    ) ||
    Boolean(
      rowFid &&
      currentUserFid &&
      rowFid ===
        currentUserFid,
    )
  );
}

function getLeaderName(
  row: LeaderRowWithWallet,
): string {
  return (
    row.display_name ||
    row.username ||
    shortenAddress(
      row.wallet_address,
    ) ||
    'Pond Hopper'
  );
}

function getLeaderValue(
  row: LeaderRowWithWallet,
  kind: LeaderboardKind,
): string | number {
  if (kind === 'streak') {
    return Number(
      row.current_streak ?? 0,
    );
  }

  if (kind === 'hops') {
    return Number(
      row.total_hops ?? 0,
    );
  }

  return formatAtomic(
    row.total_toby_atomic ?? '0',
  );
}

function getLeaderUnit(
  kind: LeaderboardKind,
): string {
  if (kind === 'streak') {
    return 'days';
  }

  if (kind === 'hops') {
    return 'hops';
  }

  return 'TOBY';
}

function getRankDisplay(
  rank: number,
): string {
  if (rank === 1) {
    return '🥇';
  }

  if (rank === 2) {
    return '🥈';
  }

  if (rank === 3) {
    return '🥉';
  }

  return `#${rank}`;
}

function getLeaderRowKey(
  row: LeaderRowWithWallet,
  rowName: string,
): string {
  const rowFid =
    getValidFid(
      row.fid,
    );

  return (
    row.id ||
    row.wallet_address ||
    (
      rowFid
        ? `fid-${rowFid}`
        : `${row.rank}-${rowName}`
    )
  );
}

export function LeaderboardPanel({
  authenticated,
  authenticatedAddress,
  currentUserFid,
  kind,
  loading,
  rows,
  onKindChange,
}: Props) {
  const eligibleRows =
    rows.filter(
      isEligibleLeader,
    );

  const currentEntry =
    eligibleRows.find(
      (row) =>
        isMatchingUser(
          row,
          authenticatedAddress,
          currentUserFid,
        ),
    ) ?? null;

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="panel-eyebrow">
            THE POND
          </span>

          <h1 className="panel-title">
            Pond leaders
          </h1>
        </div>

        {authenticated && (
          <div className="your-rank-pill">
            {currentEntry
              ? `Your rank #${currentEntry.rank}`
              : 'Hop to join'}
          </div>
        )}
      </div>

      <div
        className="tabs"
        role="tablist"
        aria-label="Leaderboard category"
      >
        {(
          [
            'streak',
            'hops',
            'toby',
          ] as const
        ).map(
          (leaderKind) => (
            <button
              key={leaderKind}
              type="button"
              role="tab"
              aria-selected={
                kind ===
                leaderKind
              }
              className={
                kind ===
                leaderKind
                  ? 'active'
                  : ''
              }
              disabled={loading}
              onClick={() =>
                onKindChange(
                  leaderKind,
                )
              }
            >
              {leaderKind ===
              'toby'
                ? 'TOBY'
                : leaderKind
                    .charAt(0)
                    .toUpperCase() +
                  leaderKind.slice(
                    1,
                  )}
            </button>
          ),
        )}
      </div>

      {loading && (
        <div
          className="empty"
          role="status"
          aria-live="polite"
        >
          <strong>
            Reading the pond
          </strong>

          <span>
            Gathering verified
            hoppers…
          </span>
        </div>
      )}

      {!loading &&
        eligibleRows.map(
          (row) => {
            const rowName =
              getLeaderName(
                row,
              );

            const isCurrentUser =
              isMatchingUser(
                row,
                authenticatedAddress,
                currentUserFid,
              );

            const rowKey =
              getLeaderRowKey(
                row,
                rowName,
              );

            const rowClassName =
              [
                'leader-row',
                isCurrentUser
                  ? 'leader-row-you'
                  : '',
                row.rank <= 3
                  ? `leader-rank-${row.rank}`
                  : '',
              ]
                .filter(Boolean)
                .join(' ');

            return (
              <div
                className={
                  rowClassName
                }
                key={rowKey}
              >
                <div className="rank">
                  {getRankDisplay(
                    row.rank,
                  )}
                </div>

                <img
                  src={
                    row.pfp_url ||
                    FALLBACK_PFP
                  }
                  alt=""
                  aria-hidden="true"
                />

                <div className="leader-identity">
                  <div className="leader-name">
                    <span>
                      {rowName}
                    </span>

                    {isCurrentUser && (
                      <span className="you-label">
                        YOU
                      </span>
                    )}
                  </div>

                  <div className="leader-title">
                    {row.current_title ||
                      'Pond Hopper'}
                  </div>
                </div>

                <div className="leader-value">
                  {getLeaderValue(
                    row,
                    kind,
                  )}

                  <div className="leader-sub">
                    {getLeaderUnit(
                      kind,
                    )}
                  </div>
                </div>
              </div>
            );
          },
        )}

      {!loading &&
        eligibleRows.length ===
          0 && (
          <div className="empty">
            <strong>
              The pond is quiet
            </strong>

            <span>
              Complete the first
              verified hop to join.
            </span>
          </div>
        )}
    </section>
  );
}
