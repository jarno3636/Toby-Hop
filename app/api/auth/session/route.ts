import { NextResponse } from 'next/server';

import {
  requireAppSession,
} from '@/lib/auth/require-app-session';

import {
  supabaseAdmin,
} from '@/lib/supabase/admin';

export const dynamic =
  'force-dynamic';

type HopUserRow = {
  fid: number;

  wallet_address:
    | string
    | null;

  username:
    | string
    | null;

  display_name:
    | string
    | null;

  pfp_url:
    | string
    | null;

  current_title:
    | string
    | null;

  total_hops:
    | number
    | string
    | null;

  current_streak:
    | number
    | string
    | null;

  longest_streak:
    | number
    | string
    | null;

  big_pond_energy:
    | number
    | string
    | null;

  total_usdc_atomic:
    | number
    | string
    | null;

  total_toby_atomic:
    | number
    | string
    | null;

  first_hop_at:
    | string
    | null;

  last_hop_at:
    | string
    | null;

  last_hop_day?:
    | string
    | null;

  today_hopped?:
    | boolean
    | null;

  rank?:
    | number
    | string
    | null;

  notifications_enabled?:
    | boolean
    | null;

  notification_url?:
    | string
    | null;

  notification_token?:
    | string
    | null;

  created_at?:
    | string
    | null;

  updated_at?:
    | string
    | null;

  [key: string]:
    unknown;
};

function noStoreHeaders() {
  return {
    'Cache-Control':
      'no-store, no-cache, must-revalidate',
  };
}

function normalizeAddress(
  value:
    | string
    | null
    | undefined,
): string | null {
  const normalized =
    value
      ?.trim()
      .toLowerCase();

  return normalized ||
    null;
}

function safeNumber(
  value: unknown,
): number {
  const parsed =
    Number(
      value ??
        0,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function safeAtomic(
  value: unknown,
): string {
  try {
    return BigInt(
      String(
        value ??
          '0',
      ),
    ).toString();
  } catch {
    return '0';
  }
}

function maximumAtomic(
  first: unknown,
  second: unknown,
): string {
  const firstValue =
    BigInt(
      safeAtomic(
        first,
      ),
    );

  const secondValue =
    BigInt(
      safeAtomic(
        second,
      ),
    );

  return (
    firstValue >=
    secondValue
      ? firstValue
      : secondValue
  ).toString();
}

function earliestDate(
  first:
    | string
    | null
    | undefined,

  second:
    | string
    | null
    | undefined,
): string | null {
  if (!first) {
    return second ??
      null;
  }

  if (!second) {
    return first;
  }

  const firstTime =
    Date.parse(
      first,
    );

  const secondTime =
    Date.parse(
      second,
    );

  if (
    !Number.isFinite(
      firstTime,
    )
  ) {
    return second;
  }

  if (
    !Number.isFinite(
      secondTime,
    )
  ) {
    return first;
  }

  return firstTime <=
    secondTime
    ? first
    : second;
}

function latestDate(
  first:
    | string
    | null
    | undefined,

  second:
    | string
    | null
    | undefined,
): string | null {
  if (!first) {
    return second ??
      null;
  }

  if (!second) {
    return first;
  }

  const firstTime =
    Date.parse(
      first,
    );

  const secondTime =
    Date.parse(
      second,
    );

  if (
    !Number.isFinite(
      firstTime,
    )
  ) {
    return second;
  }

  if (
    !Number.isFinite(
      secondTime,
    )
  ) {
    return first;
  }

  return firstTime >=
    secondTime
    ? first
    : second;
}

function chooseTitle(
  fidUser:
    | HopUserRow
    | null,

  walletUser:
    | HopUserRow
    | null,
): string {
  const fidTitle =
    fidUser
      ?.current_title
      ?.trim();

  const walletTitle =
    walletUser
      ?.current_title
      ?.trim();

  const fidHops =
    safeNumber(
      fidUser
        ?.total_hops,
    );

  const walletHops =
    safeNumber(
      walletUser
        ?.total_hops,
    );

  if (
    walletHops >
      fidHops &&
    walletTitle
  ) {
    return walletTitle;
  }

  if (
    fidTitle &&
    fidTitle !==
      'New Hopper'
  ) {
    return fidTitle;
  }

  if (
    walletTitle &&
    walletTitle !==
      'New Hopper'
  ) {
    return walletTitle;
  }

  return (
    fidTitle ??
    walletTitle ??
    'New Hopper'
  );
}

function mergeUserRows(
  fid:
    | number
    | null,

  sessionAddress:
    | string
    | null,

  fidUser:
    | HopUserRow
    | null,

  walletUser:
    | HopUserRow
    | null,
): HopUserRow | null {
  if (
    !fidUser &&
    !walletUser
  ) {
    return null;
  }

  const canonical =
    fidUser ??
    walletUser;

  if (!canonical) {
    return null;
  }

  const canonicalFid =
    fid &&
    fid > 0
      ? fid
      : canonical.fid;

  const totalHops =
    Math.max(
      safeNumber(
        fidUser
          ?.total_hops,
      ),

      safeNumber(
        walletUser
          ?.total_hops,
      ),
    );

  const currentStreak =
    Math.max(
      safeNumber(
        fidUser
          ?.current_streak,
      ),

      safeNumber(
        walletUser
          ?.current_streak,
      ),
    );

  const longestStreak =
    Math.max(
      safeNumber(
        fidUser
          ?.longest_streak,
      ),

      safeNumber(
        walletUser
          ?.longest_streak,
      ),
    );

  const bigPondEnergy =
    Math.max(
      safeNumber(
        fidUser
          ?.big_pond_energy,
      ),

      safeNumber(
        walletUser
          ?.big_pond_energy,
      ),
    );

  const rankValues =
    [
      fidUser?.rank,
      walletUser?.rank,
    ]
      .map(
        safeNumber,
      )
      .filter(
        (value) =>
          value > 0,
      );

  const rank =
    rankValues.length
      ? Math.min(
          ...rankValues,
        )
      : null;

  return {
    ...walletUser,
    ...fidUser,

    fid:
      canonicalFid,

    wallet_address:
      normalizeAddress(
        sessionAddress,
      ) ??
      normalizeAddress(
        fidUser
          ?.wallet_address,
      ) ??
      normalizeAddress(
        walletUser
          ?.wallet_address,
      ),

    username:
      fidUser
        ?.username ??
      walletUser
        ?.username ??
      null,

    display_name:
      fidUser
        ?.display_name ??
      walletUser
        ?.display_name ??
      null,

    pfp_url:
      fidUser
        ?.pfp_url ??
      walletUser
        ?.pfp_url ??
      null,

    current_title:
      chooseTitle(
        fidUser,
        walletUser,
      ),

    total_hops:
      totalHops,

    current_streak:
      currentStreak,

    longest_streak:
      longestStreak,

    big_pond_energy:
      bigPondEnergy,

    /*
     * Use the largest stored totals rather than adding
     * the two rows. This prevents duplicate totals when
     * both profiles were already updated for a hop.
     */
    total_usdc_atomic:
      maximumAtomic(
        fidUser
          ?.total_usdc_atomic,

        walletUser
          ?.total_usdc_atomic,
      ),

    total_toby_atomic:
      maximumAtomic(
        fidUser
          ?.total_toby_atomic,

        walletUser
          ?.total_toby_atomic,
      ),

    first_hop_at:
      earliestDate(
        fidUser
          ?.first_hop_at,

        walletUser
          ?.first_hop_at,
      ),

    last_hop_at:
      latestDate(
        fidUser
          ?.last_hop_at,

        walletUser
          ?.last_hop_at,
      ),

    last_hop_day:
      latestDate(
        fidUser
          ?.last_hop_day,

        walletUser
          ?.last_hop_day,
      ),

    today_hopped:
      Boolean(
        fidUser
          ?.today_hopped ||
        walletUser
          ?.today_hopped,
      ),

    rank,

    notifications_enabled:
      Boolean(
        fidUser
          ?.notifications_enabled ||
        walletUser
          ?.notifications_enabled,
      ),

    notification_url:
      fidUser
        ?.notification_url ??
      walletUser
        ?.notification_url ??
      null,

    notification_token:
      fidUser
        ?.notification_token ??
      walletUser
        ?.notification_token ??
      null,

    created_at:
      earliestDate(
        fidUser
          ?.created_at,

        walletUser
          ?.created_at,
      ),

    updated_at:
      latestDate(
        fidUser
          ?.updated_at,

        walletUser
          ?.updated_at,
      ),
  };
}

async function loadUserByFid(
  fid: number,
): Promise<HopUserRow | null> {
  const db =
    supabaseAdmin();

  const {
    data,
    error,
  } =
    await db
      .from(
        'toby_hop_users',
      )
      .select('*')
      .eq(
        'fid',
        fid,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load the Farcaster profile: ${error.message}`,
    );
  }

  return (
    data as
      | HopUserRow
      | null
  );
}

async function loadUserByWallet(
  walletAddress: string,
): Promise<HopUserRow | null> {
  const db =
    supabaseAdmin();

  const normalizedAddress =
    normalizeAddress(
      walletAddress,
    );

  if (!normalizedAddress) {
    return null;
  }

  /*
   * Use a list instead of maybeSingle because previous
   * identity bugs may have created more than one row
   * associated with the same wallet.
   */
  const {
    data,
    error,
  } =
    await db
      .from(
        'toby_hop_users',
      )
      .select('*')
      .ilike(
        'wallet_address',
        normalizedAddress,
      )
      .order(
        'fid',
        {
          ascending:
            false,
        },
      )
      .limit(10);

  if (error) {
    throw new Error(
      `Unable to load the wallet profile: ${error.message}`,
    );
  }

  const rows =
    (
      data ??
      []
    ) as HopUserRow[];

  if (!rows.length) {
    return null;
  }

  /*
   * Prefer a positive-FID row. Otherwise use the
   * temporary wallet profile with the highest totals.
   */
  return (
    rows.find(
      (row) =>
        row.fid >
        0,
    ) ??
    rows.sort(
      (
        first,
        second,
      ) => {
        const firstToby =
          BigInt(
            safeAtomic(
              first
                .total_toby_atomic,
            ),
          );

        const secondToby =
          BigInt(
            safeAtomic(
              second
                .total_toby_atomic,
            ),
          );

        if (
          firstToby ===
          secondToby
        ) {
          return (
            safeNumber(
              second
                .total_hops,
            ) -
            safeNumber(
              first
                .total_hops,
            )
          );
        }

        return secondToby >
          firstToby
          ? 1
          : -1;
      },
    )[0] ??
    null
  );
}

export async function GET() {
  try {
    const session =
      await requireAppSession();

    const sessionFid =
      typeof session.fid ===
        'number' &&
      Number.isSafeInteger(
        session.fid,
      ) &&
      session.fid > 0
        ? session.fid
        : null;

    const sessionAddress =
      typeof session.address ===
        'string'
        ? normalizeAddress(
            session.address,
          )
        : null;

    const [
      fidUser,
      walletUser,
    ] =
      await Promise.all([
        sessionFid
          ? loadUserByFid(
              sessionFid,
            )
          : Promise.resolve(
              null,
            ),

        sessionAddress
          ? loadUserByWallet(
              sessionAddress,
            )
          : Promise.resolve(
              null,
            ),
      ]);

    const user =
      mergeUserRows(
        sessionFid,
        sessionAddress,
        fidUser,
        walletUser,
      );

    const resolvedFid =
      sessionFid ??
      (
        typeof user?.fid ===
          'number' &&
        user.fid > 0
          ? user.fid
          : null
      );

    const resolvedAddress =
      sessionAddress ??
      (
        typeof user
          ?.wallet_address ===
          'string'
          ? normalizeAddress(
              user
                .wallet_address,
            )
          : null
      );

    return NextResponse.json(
      {
        authenticated:
          true,

        authMethod:
          session.authMethod ??
          (
            resolvedFid
              ? 'farcaster'
              : resolvedAddress
                ? 'siwe'
                : null
          ),

        fid:
          resolvedFid,

        address:
          resolvedAddress,

        user,
      },
      {
        headers:
          noStoreHeaders(),
      },
    );
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : 'Unable to read session.';

    const normalizedMessage =
      message.toLowerCase();

    const isAuthenticationError =
      normalizedMessage.includes(
        'session',
      ) ||
      normalizedMessage.includes(
        'authenticated',
      ) ||
      normalizedMessage.includes(
        'unauthorized',
      );

    console.error(
      'GET /api/auth/session failed:',
      cause,
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
          isAuthenticationError
            ? 401
            : 500,

        headers:
          noStoreHeaders(),
      },
    );
  }
}
