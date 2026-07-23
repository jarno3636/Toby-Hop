import {
  NextResponse,
} from 'next/server';

import {
  requireCanonicalIdentity,
} from '@/lib/auth/canonical-identity';

import {
  supabaseAdmin,
} from '@/lib/supabase/admin';

export const dynamic =
  'force-dynamic';

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
    const identity =
      await requireCanonicalIdentity();

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
        .from('toby_hop_users')
        .update(updates);

    if (identity.fid) {
      query =
        query.eq(
          'fid',
          identity.fid,
        );
    } else if (identity.wallet) {
      query =
        query.ilike(
          'wallet_address',
          identity.wallet
            .toLowerCase(),
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
      {
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : 'Unable to update profile.';

    const lowered =
      message.toLowerCase();

    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status:
          lowered.includes(
            'authentication',
          ) ||
          lowered.includes(
            'session',
          )
            ? 401
            : 500,

        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }
}
