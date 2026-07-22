import { NextResponse } from 'next/server';
import { requireFarcasterUser } from '@/lib/auth/require-farcaster-user';
import { supabaseAdmin } from '@/lib/supabase/admin';

function clean(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

export async function POST(request: Request) {
  try {
    const auth = await requireFarcasterUser(request);
    const body = await request.json().catch(() => ({}));
    const db = supabaseAdmin();

    /*
      The FID comes from the verified Farcaster Quick Auth token.

      Username, display name and PFP come from Farcaster Mini App context.
      These profile values are only used for display and are never used
      to authorize the user.
    */
    const { data, error } = await db.rpc(
      'toby_hop_get_or_create_user',
      {
        p_fid: auth.fid,
        p_username: clean(body.username, 64),
        p_display_name: clean(body.displayName, 100),
        p_pfp_url: clean(body.pfpUrl, 1000),
      },
    );

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (cause) {
    return new NextResponse(
      cause instanceof Error ? cause.message : 'Unauthorized',
      { status: 401 },
    );
  }
}
