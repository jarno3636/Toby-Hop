import {
  NextResponse,
} from 'next/server';
import {
  getAddress,
  isAddress,
} from 'viem';

import {
  createAppSession,
} from '@/lib/auth/app-session';
import {
  requireFarcasterUser,
} from '@/lib/auth/require-farcaster-user';
import {
  supabaseAdmin,
} from '@/lib/supabase/admin';

type FarcasterAuthBody = {
  username?: unknown;
  displayName?: unknown;
  pfpUrl?: unknown;
  walletAddress?: unknown;
};

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

function parseWalletAddress(
  value: unknown,
): `0x${string}` | null {
  if (
    typeof value !== 'string' ||
    !isAddress(value)
  ) {
    return null;
  }

  return getAddress(value);
}

export async function POST(
  request: Request,
) {
  try {
    const auth =
      await requireFarcasterUser(
        request,
      );

    const body =
      (await request
        .json()
        .catch(
          () => ({}),
        )) as FarcasterAuthBody;

    const walletAddress =
      parseWalletAddress(
        body.walletAddress,
      );

    const username =
      clean(
        body.username,
        64,
      );

    const displayName =
      clean(
        body.displayName,
        100,
      );

    const pfpUrl =
      clean(
        body.pfpUrl,
        1_000,
      );

    const db =
      supabaseAdmin();

    /*
      First create or retrieve the Farcaster identity.
      The FID comes only from the verified Quick Auth JWT.
    */
    const {
      data:
        farcasterUserResult,
      error:
        farcasterUserError,
    } =
      await db.rpc(
        'toby_hop_get_or_create_user',
        {
          p_fid:
            auth.fid,

          p_username:
            username,

          p_display_name:
            displayName,

          p_pfp_url:
            pfpUrl,
        },
      );

    if (
      farcasterUserError
    ) {
      throw farcasterUserError;
    }

    let user =
      farcasterUserResult;

    /*
      Link the currently exposed Farcaster wallet when one
      is available. The transaction verification route must
      still verify the actual sender of every hop.
    */
    if (walletAddress) {
      const {
        data:
          walletUserResult,
        error:
          walletUserError,
      } =
        await db.rpc(
          'toby_hop_get_or_create_wallet_user',
          {
            p_wallet_address:
              walletAddress
                .toLowerCase(),
          },
        );

      if (walletUserError) {
        throw walletUserError;
      }

      const walletUser =
        Array.isArray(
          walletUserResult,
        )
          ? walletUserResult[0]
          : walletUserResult;

      const walletUserId =
        walletUser?.id;

      if (walletUserId) {
        const {
          data:
            linkedUser,
          error:
            linkError,
        } =
          await db
            .from(
              'toby_hop_users',
            )
            .update({
              fid:
                auth.fid,

              username,

              display_name:
                displayName,

              pfp_url:
                pfpUrl,

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              'id',
              walletUserId,
            )
            .select('*')
            .single();

        if (linkError) {
          /*
            This commonly means the FID is already attached
            to a legacy row. Do not destroy authentication;
            return the verified Farcaster record instead.
          */
          console.error(
            'Unable to link Farcaster wallet profile:',
            linkError,
          );
        } else {
          user =
            linkedUser;
        }
      }
    }

    await createAppSession({
      authMethod:
        'farcaster',

      fid:
        auth.fid,

      address:
        walletAddress ??
        undefined,

      chainId: 8453,
    });

    return NextResponse.json({
      authenticated: true,
      authMethod:
        'farcaster',
      fid:
        auth.fid,
      address:
        walletAddress,
      user,
    });
  } catch (cause) {
    console.error(
      'Farcaster authentication failed:',
      cause,
    );

    return NextResponse.json(
      {
        authenticated:
          false,

        user: null,

        error:
          cause instanceof Error
            ? cause.message
            : 'Farcaster authentication failed.',
      },
      {
        status: 401,
      },
    );
  }
}
