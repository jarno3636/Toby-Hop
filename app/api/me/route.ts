import {
  NextResponse,
} from 'next/server';

import {
  requireAppSession,
} from '@/lib/auth/require-app-session';
import {
  supabaseAdmin,
} from '@/lib/supabase/admin';

function clean(
  value: unknown,
  maxLength: number,
): string | null {
  if (
    typeof value !== 'string'
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned
    ? cleaned.slice(
        0,
        maxLength,
      )
    : null;
}

export async function POST(
  request: Request,
) {
  try {
    const session =
      await requireAppSession();

    const body =
      await request
        .json()
        .catch(
          () => ({}),
        );

    const updates = {
      username:
        clean(
          body.username,
          64,
        ),

      display_name:
        clean(
          body.displayName,
          100,
        ),

      pfp_url:
        clean(
          body.pfpUrl,
          1_000,
        ),

      updated_at:
        new Date()
          .toISOString(),
    };

    const db =
      supabaseAdmin();

    let query =
      db
        .from(
          'toby_hop_users',
        )
        .update(updates);

    if (session.address) {
      query =
        query.eq(
          'wallet_address',
          session.address
            .toLowerCase(),
        );
    } else if (session.fid) {
      query =
        query.eq(
          'fid',
          session.fid,
        );
    } else {
      throw new Error(
        'No session identity is available.',
      );
    }

    const {
      data,
      error,
    } =
      await query
        .select('*')
        .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      data,
    );
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : 'Unable to update profile.',
      },
      {
        status: 401,
      },
    );
  }
}
