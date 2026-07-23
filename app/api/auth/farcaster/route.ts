import {
  NextResponse,
} from 'next/server';
import {
  getAddress,
  isAddress,
  type Address,
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

function cleanText(
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

function cleanWalletAddress(
  value: unknown,
): Address | null {
  if (
    typeof value !== 'string' ||
    !isAddress(value)
  ) {
    return null;
  }

  return getAddress(value);
}

function firstRpcRow<T>(
  value: T | T[] | null,
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export async function POST(
  request: Request,
) {
  try {
    /*
      The FID is accepted only from the verified
      Farcaster Quick Auth token.
    */
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

    const username =
      cleanText(
        body.username,
        64,
      );

    const displayName =
      cleanText(
        body.displayName,
        100,
      );

    const pfpUrl =
      cleanText(
        body.pfpUrl,
        1_000,
      );

    const walletAddress =
      cleanWalletAddress(
        body.walletAddress,
      );

    const db =
      supabaseAdmin();

    /*
      Resolve or create the Farcaster user first.
      Context profile fields are display data only.
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

    if (farcasterUserError) {
      console.error(
        'Farcaster user RPC failed:',
        farcasterUserError,
      );

      throw new Error(
        farcasterUserError.message,
      );
    }

    let user =
      firstRpcRow(
        farcasterUserResult,
      );

    /*
      The first automatic Quick Auth request may not have
      a wallet yet. TobyHopApp calls this route again with
      the transaction wallet when the user taps Toby.
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
        console.error(
          'Wallet user RPC failed:',
          walletUserError,
        );

        throw new Error(
          walletUserError.message,
        );
      }

      const walletUser =
        firstRpcRow(
          walletUserResult,
        );

      const walletUserId =
        walletUser &&
        typeof walletUser ===
          'object' &&
        'id' in walletUser &&
        typeof walletUser.id ===
          'string'
          ? walletUser.id
          : null;

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
            .maybeSingle();

        if (linkError) {
          console.error(
            'Farcaster-wallet linking failed:',
            linkError,
          );

          /*
            Do not reject valid Quick Auth solely because
            a legacy database record needs reconciliation.
          */
        } else if (linkedUser) {
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

      chainId:
        8453,
    });

    return NextResponse.json({
      authenticated:
        true,

      authMethod:
        'farcaster',

      fid:
        auth.fid,

      address:
        walletAddress,

      user:
        user ?? null,
    });
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : 'Farcaster authentication failed.';

    console.error(
      'POST /api/auth/farcaster failed:',
      {
        message,
        cause,
      },
    );

    return NextResponse.json(
      {
        authenticated:
          false,

        authMethod:
          null,

        fid:
          null,

        address:
          null,

        user:
          null,

        /*
          Leave this visible while debugging.
          It will tell us whether the remaining problem
          is domain verification or the database.
        */
        error:
          message,
      },
      {
        status: 401,

        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }
}
