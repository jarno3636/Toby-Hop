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

type FarcasterUserRow = {
  fid: number | string;
  wallet_address: string | null;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  current_title: string | null;
  total_hops: number | string | null;
  current_streak: number | string | null;
  longest_streak: number | string | null;
  big_pond_energy: number | string | null;
  total_toby_atomic: string | null;
  total_usdc_atomic: string | null;
  first_hop_at: string | null;
  last_hop_at: string | null;
  last_hop_day: string | null;
  today_hopped: boolean | null;
  rank: number | string | null;
  created_at: string | null;
  updated_at: string | null;
  [key: string]: unknown;
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

function normalizeAtomic(
  value: unknown,
): string {
  if (
    typeof value !== 'string'
  ) {
    return '0';
  }

  const cleaned =
    value.trim();

  if (
    !/^\d+$/.test(cleaned)
  ) {
    return '0';
  }

  try {
    return BigInt(
      cleaned,
    ).toString();
  } catch {
    return '0';
  }
}

function normalizeUser(
  value: FarcasterUserRow,
): FarcasterUserRow {
  return {
    ...value,

    fid:
      Number(
        value.fid,
      ),

    total_toby_atomic:
      normalizeAtomic(
        value.total_toby_atomic,
      ),

    total_usdc_atomic:
      normalizeAtomic(
        value.total_usdc_atomic,
      ),
  };
}

export const dynamic =
  'force-dynamic';

export async function POST(
  request: Request,
) {
  try {
    /*
      This validates the currently active Farcaster profile.

      It must be called during app startup, not only when the
      user attempts to hop.
    */
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
      Use the RPC that casts atomic numeric values to text.

      Do not use:
      .from('toby_hop_users').select('*')

      Large PostgreSQL numeric values can otherwise arrive in
      JavaScript scientific notation and lose precision.
    */
    const {
      data:
        persistedUserResult,
      error:
        persistedUserError,
    } =
      await db.rpc(
        'toby_hop_get_user_by_fid',
        {
          p_fid:
            auth.fid,
        },
      );

    if (persistedUserError) {
      console.error(
        'Unable to reload Farcaster user:',
        persistedUserError,
      );

      throw new Error(
        persistedUserError.message,
      );
    }

    const persistedUser =
      firstRpcRow(
        persistedUserResult as
          | FarcasterUserRow
          | FarcasterUserRow[]
          | null,
      );

    if (!persistedUser) {
      throw new Error(
        'The Farcaster user was not found after authentication.',
      );
    }

    const normalizedUser =
      normalizeUser(
        persistedUser,
      );

    /*
      Recreate the app session using the currently validated
      Farcaster profile.

      This replaces a stale cookie left behind by another
      Farcaster profile.
    */
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
          normalizedUser,
      },
      {
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate',

          Pragma:
            'no-cache',

          Expires:
            '0',
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

          Pragma:
            'no-cache',

          Expires:
            '0',
        },
      },
    );
  }
}
