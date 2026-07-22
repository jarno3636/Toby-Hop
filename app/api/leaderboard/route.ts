import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { LeaderboardKind } from '@/lib/types';

const VALID_KINDS =
  new Set<LeaderboardKind>([
    'streak',
    'hops',
    'toby',
  ]);

export async function GET(
  request: Request,
) {
  try {
    const url =
      new URL(request.url);

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
        ? (requestedKind as LeaderboardKind)
        : 'streak';

    const db =
      supabaseAdmin();

    const {
      data,
      error,
    } =
      await db.rpc(
        'toby_hop_leaderboard',
        {
          p_kind: kind,
          p_limit: 100,
        },
      );

    if (error) {
      console.error(
        'Leaderboard database error:',
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
      Array.isArray(data)
        ? data
        : [],
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
