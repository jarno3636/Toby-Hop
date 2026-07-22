import { NextResponse } from 'next/server';

import { requireFarcasterUser } from '@/lib/auth/require-farcaster-user';
import { supabaseAdmin } from '@/lib/supabase/admin';

const VALID_KINDS = new Set([
  'streak',
  'hops',
  'toby',
]);

export async function GET(request: Request) {
  try {
    await requireFarcasterUser(request);

    const url = new URL(request.url);
    const kind = url.searchParams.get('kind');

    if (!kind || !VALID_KINDS.has(kind)) {
      return NextResponse.json(
        {
          error: 'Invalid leaderboard type.',
        },
        {
          status: 400,
        },
      );
    }

    const db = supabaseAdmin();

    const { data, error } = await db.rpc(
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
          error: error.message,
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json(data ?? []);
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
        status: 401,
      },
    );
  }
}
