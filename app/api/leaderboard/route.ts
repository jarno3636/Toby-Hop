import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import type {
  LeaderboardKind,
  LeaderboardResponse,
} from '@/lib/types';

const VALID_KINDS = new Set<LeaderboardKind>([
  'streak',
  'hops',
  'energy',
  'toby',
]);

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type LeaderboardUserRow = {
  fid: number | null;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  wallet_address: string | null;
  total_hops: number | null;
  big_pond_energy: number | null;
  current_streak: number | null;
  longest_streak: number | null;
  total_toby_atomic: string | null;
  current_title: string | null;
  last_hop_at: string | null;
};

function parsePositiveInteger(
  value: string | null,
  fallback: number,
): number {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedKind = url.searchParams.get('kind');

    const kind: LeaderboardKind =
      requestedKind &&
      VALID_KINDS.has(requestedKind as LeaderboardKind)
        ? (requestedKind as LeaderboardKind)
        : 'streak';

    const requestedPage = parsePositiveInteger(
      url.searchParams.get('page'),
      1,
    );

    const pageSize = Math.min(
      parsePositiveInteger(
        url.searchParams.get('pageSize'),
        DEFAULT_PAGE_SIZE,
      ),
      MAX_PAGE_SIZE,
    );

    const db = supabaseAdmin();

    const countResult = await db
      .from('toby_hop_users')
      .select('fid', {
        count: 'exact',
        head: true,
      })
      .or('total_hops.gt.0,big_pond_energy.gt.0');

    if (countResult.error) {
      throw countResult.error;
    }

    const total = countResult.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const rangeEnd = Math.min(offset + pageSize - 1, Math.max(total - 1, 0));

    let query = db
      .from('toby_hop_users')
      .select(`
        fid,
        username,
        display_name,
        pfp_url,
        wallet_address,
        total_hops,
        big_pond_energy,
        current_streak,
        longest_streak,
        total_toby_atomic,
        current_title,
        last_hop_at
      `)
      .or('total_hops.gt.0,big_pond_energy.gt.0');

    if (kind === 'toby') {
      query = query
        .order('total_toby_atomic', {
          ascending: false,
          nullsFirst: false,
        })
        .order('total_hops', {
          ascending: false,
          nullsFirst: false,
        })
        .order('current_streak', {
          ascending: false,
          nullsFirst: false,
        });
    } else if (kind === 'energy') {
      query = query
        .order('big_pond_energy', {
          ascending: false,
          nullsFirst: false,
        })
        .order('total_hops', {
          ascending: false,
          nullsFirst: false,
        })
        .order('current_streak', {
          ascending: false,
          nullsFirst: false,
        });
    } else if (kind === 'hops') {
      query = query
        .order('total_hops', {
          ascending: false,
          nullsFirst: false,
        })
        .order('current_streak', {
          ascending: false,
          nullsFirst: false,
        })
        .order('longest_streak', {
          ascending: false,
          nullsFirst: false,
        });
    } else {
      query = query
        .order('current_streak', {
          ascending: false,
          nullsFirst: false,
        })
        .order('longest_streak', {
          ascending: false,
          nullsFirst: false,
        })
        .order('total_hops', {
          ascending: false,
          nullsFirst: false,
        });
    }

    const { data, error } = await query.range(offset, rangeEnd);

    if (error) {
      console.error('Leaderboard query failed:', error);

      return NextResponse.json(
        {
          error: 'Unable to load the leaderboard.',
        },
        {
          status: 500,
        },
      );
    }

    const rows = ((data ?? []) as LeaderboardUserRow[]).map(
      (row, index) => ({
        rank: offset + index + 1,
        fid: row.fid,
        username: row.username,
        display_name: row.display_name,
        pfp_url: row.pfp_url,
        wallet_address: row.wallet_address,
        total_hops: row.total_hops ?? 0,
        big_pond_energy: row.big_pond_energy ?? 0,
        current_streak: row.current_streak ?? 0,
        longest_streak: row.longest_streak ?? 0,
        total_toby_atomic: row.total_toby_atomic ?? '0',
        current_title: row.current_title ?? 'Pond Hopper',
        last_hop_at: row.last_hop_at,
      }),
    );

    const response: LeaderboardResponse = {
      rows,
      kind,
      page,
      pageSize,
      total,
      totalPages,
      rangeStart: total === 0 ? 0 : offset + 1,
      rangeEnd: total === 0 ? 0 : offset + rows.length,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control':
          'public, s-maxage=15, stale-while-revalidate=45',
      },
    });
  } catch (cause) {
    console.error('Leaderboard route error:', cause);

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
