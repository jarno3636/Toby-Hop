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
  page: number;
  total: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  onKindChange: (
    kind: LeaderboardKind,
  ) => void;
  onPageChange: (
    page: number,
  ) => void;
};

function isEligibleLeader(
  row: LeaderRowWithWallet,
): boolean {
  return (
    Number(row.total_hops ?? 0) > 0 ||
    Number(row.big_pond_energy ?? 0) > 0
  );
}

function getValidFid(
  fid: LeaderRowWithWallet['fid'],
): number | null {
  return typeof fid === 'number' && fid > 0
    ? fid
    : null;
}

function isMatchingUser(
  row: LeaderRowWithWallet,
  authenticatedAddress: string | null,
  currentUserFid: number | null,
): boolean {
  const rowFid = getValidFid(row.fid);

  return (
    addressesMatch(
      row.wallet_address,
      authenticatedAddress,
    ) ||
    Boolean(
      rowFid &&
      currentUserFid &&
      rowFid === currentUserFid,
    )
  );
}

function getLeaderName(
  row: LeaderRowWithWallet,
): string {
  return (
    row.display_name ||
    row.username ||
    shortenAddress(row.wallet_address) ||
    'Pond Hopper'
  );
}

function compactLargeNumber(
  value: number,
): string {
  return new Intl.NumberFormat('en-US', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function compactAtomic(
  value: string,
): string {
  const exact = formatAtomic(value);
  const numeric = Number(exact.replaceAll(',', ''));

  if (
    Number.isFinite(numeric) &&
    Math.abs(numeric) >= 10_000
  ) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(numeric);
  }

  return exact;
}

function getLeaderValue(
  row: LeaderRowWithWallet,
  kind: LeaderboardKind,
): {
  display: string;
  exact: string;
} {
  if (kind === 'streak') {
    const value = Number(row.current_streak ?? 0);

    return {
      display: compactLargeNumber(value),
      exact: value.toLocaleString('en-US'),
    };
  }

  if (kind === 'hops') {
    const value = Number(row.total_hops ?? 0);

    return {
      display: compactLargeNumber(value),
      exact: value.toLocaleString('en-US'),
    };
  }

  if (kind === 'energy') {
    const value = Number(row.big_pond_energy ?? 0);
    return {
      display: compactLargeNumber(value),
      exact: value.toLocaleString('en-US'),
    };
  }

  const exact = formatAtomic(
    row.total_toby_atomic ?? '0',
  );

  return {
    display: compactAtomic(
      row.total_toby_atomic ?? '0',
    ),
    exact,
  };
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

  if (kind === 'energy') {
    return 'BPE';
  }

  return 'TOBY';
}

function getRankDisplay(
  rank: number,
): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';

  return `#${rank.toLocaleString('en-US')}`;
}

function getLeaderRowKey(
  row: LeaderRowWithWallet,
  rowName: string,
): string {
  const rowFid = getValidFid(row.fid);

  return (
    row.id ||
    row.wallet_address ||
    (rowFid
      ? `fid-${rowFid}`
      : `${row.rank}-${rowName}`)
  );
}

function PaginationControls({
  page,
  total,
  totalPages,
  rangeStart,
  rangeEnd,
  loading,
  onPageChange,
}: {
  page: number;
  total: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) {
    return null;
  }

  return (
    <div className="leader-pagination">
      <div className="leader-range">
        Showing{' '}
        <strong>
          {rangeStart.toLocaleString('en-US')}–
          {rangeEnd.toLocaleString('en-US')}
        </strong>{' '}
        of{' '}
        <strong>
          {total.toLocaleString('en-US')}
        </strong>
      </div>

      <div
        className="leader-page-controls"
        aria-label="Leaderboard pages"
      >
        <button
          type="button"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(1)}
          aria-label="First leaderboard page"
        >
          «
        </button>

        <button
          type="button"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous leaderboard page"
        >
          ‹
        </button>

        <span className="leader-page-count">
          Page{' '}
          <strong>
            {page.toLocaleString('en-US')}
          </strong>{' '}
          of{' '}
          <strong>
            {totalPages.toLocaleString('en-US')}
          </strong>
        </span>

        <button
          type="button"
          disabled={
            loading ||
            page >= totalPages
          }
          onClick={() => onPageChange(page + 1)}
          aria-label="Next leaderboard page"
        >
          ›
        </button>

        <button
          type="button"
          disabled={
            loading ||
            page >= totalPages
          }
          onClick={() => onPageChange(totalPages)}
          aria-label="Last leaderboard page"
        >
          »
        </button>
      </div>
    </div>
  );
}

export function LeaderboardPanel({
  authenticated,
  authenticatedAddress,
  currentUserFid,
  kind,
  loading,
  rows,
  page,
  total,
  totalPages,
  rangeStart,
  rangeEnd,
  onKindChange,
  onPageChange,
}: Props) {
  const eligibleRows = rows.filter(isEligibleLeader);

  const currentEntry =
    eligibleRows.find((row) =>
      isMatchingUser(
        row,
        authenticatedAddress,
        currentUserFid,
      ),
    ) ?? null;

  return (
    <section className="panel leaderboard-panel">
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
              ? `Your rank #${currentEntry.rank.toLocaleString('en-US')}`
              : 'Find your page'}
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
            'energy',
            'toby',
          ] as const
        ).map((leaderKind) => (
          <button
            key={leaderKind}
            type="button"
            role="tab"
            aria-selected={kind === leaderKind}
            className={
              kind === leaderKind
                ? 'active'
                : ''
            }
            disabled={loading}
            onClick={() =>
              onKindChange(leaderKind)
            }
          >
            {leaderKind === 'toby'
              ? 'TOBY'
              : leaderKind === 'energy'
                ? 'Energy'
                : leaderKind
                  .charAt(0)
                  .toUpperCase() +
                leaderKind.slice(1)}
          </button>
        ))}
      </div>

      <PaginationControls
        page={page}
        total={total}
        totalPages={totalPages}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        loading={loading}
        onPageChange={onPageChange}
      />

      {loading && (
        <div
          className="empty"
          role="status"
          aria-live="polite"
        >
          <strong>Reading the pond</strong>
          <span>
            Gathering verified hoppers…
          </span>
        </div>
      )}

      {!loading &&
        eligibleRows.map((row) => {
          const rowName = getLeaderName(row);
          const isCurrentUser =
            isMatchingUser(
              row,
              authenticatedAddress,
              currentUserFid,
            );
          const rowKey = getLeaderRowKey(
            row,
            rowName,
          );
          const value = getLeaderValue(
            row,
            kind,
          );

          const rowClassName = [
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
              className={rowClassName}
              key={rowKey}
            >
              <div className="rank">
                {getRankDisplay(row.rank)}
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
                  <span title={rowName}>
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

              <div
                className="leader-value"
                title={`${value.exact} ${getLeaderUnit(kind)}`}
              >
                <span>{value.display}</span>

                <div className="leader-sub">
                  {getLeaderUnit(kind)}
                </div>
              </div>
            </div>
          );
        })}

      {!loading && eligibleRows.length === 0 && (
        <div className="empty">
          <strong>The pond is quiet</strong>
          <span>
            Complete the first verified hop to join.
          </span>
        </div>
      )}

      {!loading && eligibleRows.length > 0 && (
        <PaginationControls
          page={page}
          total={total}
          totalPages={totalPages}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          loading={loading}
          onPageChange={onPageChange}
        />
      )}
    </section>
  );
}
