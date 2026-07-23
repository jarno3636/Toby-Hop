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

const NO_STORE_HEADERS = {
  'Cache-Control':
    'no-store, no-cache, must-revalidate',

  Pragma:
    'no-cache',

  Expires:
    '0',
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
  value:
    | T
    | T[]
    | null
    | undefined,
): T | null {
  if (
    Array.isArray(value)
  ) {
    return value[0] ?? null;
  }

  return value ?? null;
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

function normalizeFid(
  value: unknown,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
    parsed <= 0
  ) {
    throw new Error(
      'The persisted Farcaster user has an invalid FID.',
    );
  }

  return parsed;
}

function normalizePersistedWallet(
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

function normalizeUser(
  value: FarcasterUserRow,
): FarcasterUserRow {
  return {
    ...value,

    fid:
      normalizeFid(
        value.fid,
      ),

    wallet_address:
      normalizePersistedWallet(
        value.wallet_address,
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
      Validates the currently active Farcaster identity from
      the Quick Auth token attached to this request.
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

    const requestedWallet =
      cleanWalletAddress(
        body.walletAddress,
      );

    const db =
      supabaseAdmin();

    /*
      Ensure the current Farcaster user exists and update
      the profile fields supplied by the Mini App context.
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
      console.error(
        'Farcaster user RPC failed:',
        farcasterUserError,
      );

      throw new Error(
        farcasterUserError.message,
      );
    }

    if (
      !firstRpcRow(
        farcasterUserResult,
      )
    ) {
      throw new Error(
        'The Farcaster user could not be created.',
      );
    }

    /*
      Only relink the user when the client actually supplied
      a valid wallet address.

      The SQL function can normalize storage casing if needed.
    */
    if (
      requestedWallet
    ) {
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
              requestedWallet,
          },
        );

      if (
        linkError
      ) {
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
      Reload through the text-safe RPC.

      Atomic balances must remain strings so large PostgreSQL
      numeric values never pass through JavaScript floating-point
      numbers.
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

    if (
      persistedUserError
    ) {
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

    if (
      !persistedUser
    ) {
      throw new Error(
        'The Farcaster user was not found after authentication.',
      );
    }

    const normalizedUser =
      normalizeUser(
        persistedUser,
      );

    const normalizedFid =
      normalizeFid(
        normalizedUser.fid,
      );

    if (
      normalizedFid !==
      auth.fid
    ) {
      throw new Error(
        'The persisted user does not match the authenticated Farcaster account.',
      );
    }

    /*
      Preserve the wallet already linked in the database when
      this automatic startup request does not include a wallet.

      Without this fallback, opening the app can recreate the
      session with address undefined and temporarily lose the
      wallet association required by hop verification.
    */
    const persistedWallet =
      normalizePersistedWallet(
        normalizedUser.wallet_address,
      );

    const sessionAddress =
      requestedWallet ??
      persistedWallet ??
      undefined;

    await createAppSession({
      authMethod:
        'farcaster',

      fid:
        auth.fid,

      address:
        sessionAddress,

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
          sessionAddress ??
          null,

        user:
          normalizedUser,
      },
      {
        headers:
          NO_STORE_HEADERS,
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

        headers:
          NO_STORE_HEADERS,
      },
    );
  }
}
