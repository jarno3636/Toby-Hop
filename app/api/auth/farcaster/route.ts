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
    const auth =
      await requireFarcasterUser(
        request,
      );

    const body =
      (
        await request
          .json()
          .catch(
            () => ({}),
          )
      ) as FarcasterAuthBody;

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

    const createdUser =
      firstRpcRow(
        farcasterUserResult,
      );

    if (!createdUser) {
      throw new Error(
        'The Farcaster user could not be created.',
      );
    }

    if (walletAddress) {
      const {
        error:
          linkError,
      } =
        await db.rpc(
          'toby_hop_link_wallet_identity',
          {
            p_fid:
              auth.fid,

            p_wallet_address:
              walletAddress
                .toLowerCase(),
          },
        );

      if (linkError) {
        console.error(
          'Farcaster-wallet linking failed:',
          linkError,
        );

        throw new Error(
          linkError.message,
        );
      }
    }

    /*
      Always reload the complete persisted row.

      Do not trust the RPC return value as the final user object,
      because the RPC may have an outdated return shape and omit
      newer fields such as total_toby_atomic.
    */
    const {
      data:
        persistedUser,
      error:
        persistedUserError,
    } =
      await db
        .from(
          'toby_hop_users',
        )
        .select('*')
        .eq(
          'fid',
          auth.fid,
        )
        .maybeSingle();

    if (persistedUserError) {
      console.error(
        'Unable to reload Farcaster user:',
        persistedUserError,
      );

      throw new Error(
        persistedUserError.message,
      );
    }

    if (!persistedUser) {
      throw new Error(
        'The Farcaster user was not found after authentication.',
      );
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

    return NextResponse.json(
      {
        authenticated:
          true,

        authMethod:
          'farcaster',

        fid:
          auth.fid,

        address:
          walletAddress,

        user:
          persistedUser,
      },
      {
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate',
        },
      },
    );
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

        error:
          message,
      },
      {
        status:
          401,

        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate',
        },
      },
    );
  }
}
