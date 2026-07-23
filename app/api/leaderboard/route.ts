import {
  NextResponse,
} from 'next/server';

import {
  supabaseAdmin,
} from '@/lib/supabase/admin';
import type {
  LeaderboardKind,
} from '@/lib/types';

const VALID_KINDS =
  new Set<LeaderboardKind>([
    'streak',
    'hops',
    'toby',
  ]);

type LeaderboardUserRow = {
  fid: number | null;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  wallet_address: string | null;
  total_hops: number | null;
  current_streak: number | null;
  longest_streak: number | null;
  total_toby_atomic: string | null;
  current_title: string | null;
  last_hop_at: string | null;
};

function compareAtomicDesc(
  first: string | null,
  second: string | null,
): number {
  const a =
    BigInt(first || '0');

  const b =
    BigInt(second || '0');

  if (a === b) {
    return 0;
  }

  return a > b ? -1 : 1;
}

function sortRows(
  rows: LeaderboardUserRow[],
  kind: LeaderboardKind,
): LeaderboardUserRow[] {
  return [...rows]
    .filter((row) =>
      Number(row.total_hops ?? 0) > 0 &&
      Boolean(row.last_hop_at),
    )
    .sort((a, b) => {
      if (kind === 'toby') {
        const tobyCompare =
          compareAtomicDesc(
            a.total_toby_atomic,
            b.total_toby_atomic,
          );

        if (tobyCompare !== 0) {
          return tobyCompare;
        }
      }

      if (kind === 'hops') {
        const hopCompare =
          Number(b.total_hops ?? 0) -
          Number(a.total_hops ?? 0);

        if (hopCompare !== 0) {
          return hopCompare;
        }
      }

      const streakCompare =
        Number(b.current_streak ?? 0) -
        Number(a.current_streak ?? 0);

      if (streakCompare !== 0) {
        return streakCompare;
      }

      const longestCompare =
        Number(b.longest_streak ?? 0) -
        Number(a.longest_streak ?? 0);

      if (longestCompare !== 0) {
        return longestCompare;
      }

      return (
        Number(b.total_hops ?? 0) -
        Number(a.total_hops ?? 0)
      );
    });
}

function mapRows(
  rows: LeaderboardUserRow[],
  kind: LeaderboardKind,
) {
  return sortRows(
    rows,
    kind,
  )
    .slice(0, 100)
    .map((row, index) => ({
      rank:
        index + 1,
      fid:
        row.fid,
      username:
        row.username,
      display_name:
        row.display_name,
      pfp_url:
        row.pfp_url,
      wallet_address:
        row.wallet_address,
      total_hops:
        row.total_hops ?? 0,
      current_streak:
        row.current_streak ?? 0,
      longest_streak:
        row.longest_streak ?? 0,
      total_toby_atomic:
        row.total_toby_atomic ?? '0',
      current_title:
        row.current_title ?? 'Pond Hopper',
      last_hop_at:
        row.last_hop_at,
    }));
}

export async function GET(
  request: Request,
) {
  try {
    const url =
      new URL(
        request.url,
      );

    const requestedKind =
      url.searchParams.get(
        'kind',
      );

    const kind:
      LeaderboardKind =
      requestedKind &&
      VALID_KINDS.has(
        requestedKind as LeaderboardKind,
      )
        ? requestedKind as LeaderboardKind
        : 'streak';

    const db =
      supabaseAdmin();

    /*
      Prefer the canonical RPC if it exists and returns rows.
      Then fall back to a direct table query. This protects the
      app when the RPC shape is stale or missing last_hop_at,
      which causes the frontend to hide all leaderboard rows.
    */
    const rpcResult =
      await db.rpc(
        'toby_hop_leaderboard',
        {
          p_kind:
            kind,
          p_limit:
            100,
        },
      );

    if (
      !rpcResult.error &&
      Array.isArray(
        rpcResult.data,
      ) &&
      rpcResult.data.length > 0
    ) {
      return NextResponse.json(
        rpcResult.data,
        {
          headers: {
            'Cache-Control':
              'public, s-maxage=15, stale-while-revalidate=45',
          },
        },
      );
    }

    if (rpcResult.error) {
      console.error(
        'Leaderboard RPC failed; using direct fallback:',
        rpcResult.error,
      );
    }

    const {
      data,
      error,
    } =
      await db
        .from(
          'toby_hop_users',
        )
        .select(
          `
            fid,
            username,
            display_name,
            pfp_url,
            wallet_address,
            total_hops,
            current_streak,
            longest_streak,
            total_toby_atomic,
            current_title,
            last_hop_at
          `,
        )
        .gt(
          'total_hops',
          0,
        )
        .not(
          'last_hop_at',
          'is',
          null,
        )
        .limit(250);

    if (error) {
      console.error(
        'Leaderboard direct fallback failed:',
        error,
      );

      return NextResponse.json(
        {
          error:
            'Unable to load the leaderboard.',
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json(
      mapRows(
        (data ?? []) as LeaderboardUserRow[],
        kind,
      ),
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=15, stale-while-revalidate=45',
        },
      },
    );
  } catch (cause) {
    console.error(
      'Leaderboard route error:',
      cause,
    );

    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : 'Unable to load leaderboard.',
      },
      {
        status: 500,
      },
    );
  }
}
