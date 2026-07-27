import { NextResponse } from 'next/server';

import { requireFarcasterUser } from '@/lib/auth/require-farcaster-user';
import { getTobyHopSettings } from '@/lib/toby-hop/settings';

const ADMIN_FIDS = new Set([1121193]);

export async function GET(request: Request) {
  try {
    const user = await requireFarcasterUser(request);

    if (!ADMIN_FIDS.has(user.fid)) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
        },
        {
          status: 403,
        },
      );
    }

    const settings = await getTobyHopSettings({
      bypassCache: true,
    });

    return NextResponse.json({
      ok: true,
      settings,
    });
  } catch (error) {
    console.error(
      '[admin-settings-test] Failed:',
      error,
    );

    return NextResponse.json(
      {
        error: 'Unable to load Toby Hop settings.',
      },
      {
        status: 500,
      },
    );
  }
}
