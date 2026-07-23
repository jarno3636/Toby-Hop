import { NextResponse } from 'next/server';
import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  isHash,
  type Address,
  type Hash,
  type TransactionReceipt,
} from 'viem';
import { base } from 'viem/chains';

import { readAppSession } from '@/lib/auth/app-session';
import {
  assertTokenConfig,
  HOP_USDC_ATOMIC,
  TOBY_ADDRESS,
  USDC_ADDRESS,
} from '@/lib/contracts';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildCast } from '@/lib/cast';
import { formatAtomic } from '@/lib/format';

const publicClient = createPublicClient({
  chain: base,
  transport: http(
    process.env.BASE_RPC_URL ||
      'https://mainnet.base.org',
  ),
});

const RECEIPT_LOOKUP_ATTEMPTS = 8;
const RECEIPT_LOOKUP_DELAY_MS = 1_250;

type VerifyHopBody = {
  txHash?: string;
  walletAddress?: string;
};

type VerifiedHopResult = {
  hop_id: string;
  streak_after: number;
  total_hops_after: number;
  daily_position: number;
  title_after: string;
};

type ExistingHopRow = {
  id: string;
  fid: number;
  wallet_address: string;
  transaction_hash: string;
  input_amount_atomic: string | null;
  toby_amount_atomic: string | null;
  streak_after_hop: number | null;
  total_hops_after: number | null;
  daily_position: number | null;
  cast_text: string | null;
};

type HopperProfile = {
  fid: number;
  display_name: string | null;
  username: string | null;
};

type ParsedTransfers = {
  usdcSpent: bigint;
  tobyReceived: bigint;
};

type ApiErrorOptions = {
  status?: number;
  retryable?: boolean;
};

class ApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: ApiErrorOptions = {},
  ) {
    super(message);

    this.name = 'ApiError';
    this.status = options.status ?? 400;
    this.retryable =
      options.retryable ?? false;
  }
}

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store',
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: noStoreHeaders(),
  });
}

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeAddress(
  value: string,
): string {
  return value.trim().toLowerCase();
}

function addressesMatch(
  first: string,
  second: string,
): boolean {
  return (
    normalizeAddress(first) ===
    normalizeAddress(second)
  );
}

function getAllowedSwapTargets(): string[] {
  return (
    process.env.ALLOWED_SWAP_TARGETS ?? ''
  )
    .split(',')
    .map(normalizeAddress)
    .filter(Boolean);
}

function logDatabaseError(
  label: string,
  error: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  },
  context?: Record<string, unknown>,
) {
  console.error(label, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    ...context,
  });
}

async function getReceiptSoon(
  hash: Hash,
): Promise<TransactionReceipt | null> {
  for (
    let attempt = 1;
    attempt <= RECEIPT_LOOKUP_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await publicClient
        .getTransactionReceipt({
          hash,
        });
    } catch (cause) {
      if (
        attempt ===
        RECEIPT_LOOKUP_ATTEMPTS
      ) {
        console.warn(
          'Transaction receipt was not available:',
          {
            hash,
            attempts:
              RECEIPT_LOOKUP_ATTEMPTS,
            cause,
          },
        );

        return null;
      }

      await sleep(
        RECEIPT_LOOKUP_DELAY_MS,
      );
    }
  }

  return null;
}

async function getExistingHopByHash(
  transactionHash: Hash,
): Promise<ExistingHopRow | null> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from('toby_hops')
    .select(`
      id,
      fid,
      wallet_address,
      transaction_hash,
      input_amount_atomic,
      toby_amount_atomic,
      streak_after_hop,
      total_hops_after,
      daily_position,
      cast_text
    `)
    .eq(
      'transaction_hash',
      transactionHash.toLowerCase(),
    )
    .maybeSingle();

  if (error) {
    logDatabaseError(
      'Unable to look up existing Toby Hop:',
      error,
      {
        transactionHash,
      },
    );

    throw new ApiError(
      `Unable to check whether this hop was already recorded: ${error.message}`,
      {
        status: 500,
      },
    );
  }

  return data as ExistingHopRow | null;
}

async function getProfileByFid(
  fid: number,
): Promise<HopperProfile | null> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from('toby_hop_users')
    .select(`
      fid,
      display_name,
      username
    `)
    .eq('fid', fid)
    .maybeSingle();

  if (error) {
    logDatabaseError(
      'Unable to load hopper profile by FID:',
      error,
      {
        fid,
      },
    );

    return null;
  }

  return data as HopperProfile | null;
}

async function getProfileByWallet(
  walletAddress: string,
): Promise<HopperProfile | null> {
  const db = supabaseAdmin();

  const {
    data,
    error,
  } = await db
    .from('toby_hop_users')
    .select(`
      fid,
      display_name,
      username
    `)
    .ilike(
      'wallet_address',
      walletAddress,
    )
    .order('fid', {
      ascending: false,
    })
    .limit(1);

  if (error) {
    logDatabaseError(
      'Unable to load hopper profile by wallet:',
      error,
      {
        walletAddress,
      },
    );

    return null;
  }

  return (
    (data?.[0] as HopperProfile | undefined) ??
    null
  );
}

function parseTransfers(
  receipt: TransactionReceipt,
  walletAddress: Address,
): ParsedTransfers {
  const normalizedWallet =
    normalizeAddress(walletAddress);

  const normalizedUsdc =
    normalizeAddress(USDC_ADDRESS);

  const normalizedToby =
    normalizeAddress(TOBY_ADDRESS);

  let usdcSpent = 0n;
  let tobyReceived = 0n;

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: erc20Abi,
        data: log.data,
        topics: log.topics,
      });

      if (
        decoded.eventName !== 'Transfer'
      ) {
        continue;
      }

      const args = decoded.args as {
        from: Address;
        to: Address;
        value: bigint;
      };

      const tokenAddress =
        normalizeAddress(log.address);

      if (
        tokenAddress === normalizedUsdc &&
        normalizeAddress(args.from) ===
          normalizedWallet
      ) {
        usdcSpent += args.value;
      }

      if (
        tokenAddress === normalizedToby &&
        normalizeAddress(args.to) ===
          normalizedWallet
      ) {
        tobyReceived += args.value;
      }
    } catch {
      // Receipt logs may contain events from contracts
      // unrelated to ERC-20 transfers.
    }
  }

  return {
    usdcSpent,
    tobyReceived,
  };
}

async function existingHopToResponse(
  hop: ExistingHopRow,
  transactionHash: Hash,
) {
  const profile =
    await getProfileByFid(hop.fid);

  const tobyAtomic =
    hop.toby_amount_atomic ?? '0';

  const tobyDisplay = formatAtomic(
    BigInt(tobyAtomic),
    18,
    2,
  );

  const streak =
    hop.streak_after_hop ?? 0;

  const totalHops =
    hop.total_hops_after ?? 0;

  const dailyPosition =
    hop.daily_position ?? 0;

  /*
   * The RPC returns title_after for a newly
   * recorded hop, but the current toby_hops
   * table does not store that value.
   */
  const title = 'Pond Hopper';

  const castText =
    hop.cast_text ??
    buildCast({
      displayName:
        profile?.display_name ?? null,
      username:
        profile?.username ?? null,
      streak,
      totalHops,
      tobyDisplay,
      dailyPosition,
      title,
    });

  return {
    hopId: hop.id,
    tobyAtomic,
    tobyDisplay,
    usdcAtomic:
      hop.input_amount_atomic ??
      HOP_USDC_ATOMIC.toString(),
    streak,
    totalHops,
    dailyPosition,
    title,
    castText,
    txHash: transactionHash,
    alreadyRecorded: true,
  };
}

async function updateHopCastText(
  hopId: string,
  castText: string,
): Promise<void> {
  const db = supabaseAdmin();

  const { error } = await db
    .from('toby_hops')
    .update({
      cast_text: castText,
    })
    .eq('id', hopId);

  if (error) {
    logDatabaseError(
      'Unable to store hop cast text:',
      error,
      {
        hopId,
      },
    );
  }
}

export async function POST(
  request: Request,
) {
  try {
    const session =
      await readAppSession();

    if (!session) {
      throw new ApiError(
        'Authentication required.',
        {
          status: 401,
        },
      );
    }

    if (!session.address) {
      throw new ApiError(
        'The authenticated session is missing a linked wallet.',
        {
          status: 401,
        },
      );
    }

    assertTokenConfig();

    const body =
      (await request
        .json()
        .catch(() => ({}))) as VerifyHopBody;

    if (
      !body.txHash ||
      !isHash(body.txHash)
    ) {
      throw new ApiError(
        'Invalid transaction hash.',
      );
    }

    if (
      !body.walletAddress ||
      !isAddress(body.walletAddress)
    ) {
      throw new ApiError(
        'Invalid wallet address.',
      );
    }

    const transactionHash =
      body.txHash as Hash;

    const submittedWallet =
      getAddress(body.walletAddress);

    const authenticatedWallet =
      getAddress(session.address);

    if (
      !addressesMatch(
        submittedWallet,
        authenticatedWallet,
      )
    ) {
      throw new ApiError(
        'The submitted wallet does not match the authenticated wallet.',
        {
          status: 403,
        },
      );
    }

    const normalizedWallet =
      normalizeAddress(
        authenticatedWallet,
      );

    /*
     * Check for an already-recorded transaction
     * before performing another RPC lookup.
     */
    const existingHop =
      await getExistingHopByHash(
        transactionHash,
      );

    if (existingHop) {
      if (
        !addressesMatch(
          existingHop.wallet_address,
          authenticatedWallet,
        )
      ) {
        throw new ApiError(
          'This transaction was already recorded for a different wallet.',
          {
            status: 403,
          },
        );
      }

      return jsonResponse(
        await existingHopToResponse(
          existingHop,
          transactionHash,
        ),
      );
    }

    const receipt =
      await getReceiptSoon(
        transactionHash,
      );

    if (!receipt) {
      throw new ApiError(
        'The transaction is not indexed yet. Try verifying again.',
        {
          status: 425,
          retryable: true,
        },
      );
    }

    if (
      receipt.status !== 'success'
    ) {
      throw new ApiError(
        'The swap transaction failed.',
      );
    }

    const transaction =
      await publicClient
        .getTransaction({
          hash: transactionHash,
        });

    if (
      !addressesMatch(
        transaction.from,
        authenticatedWallet,
      )
    ) {
      throw new ApiError(
        'The authenticated wallet did not send this transaction.',
        {
          status: 403,
        },
      );
    }

    const allowedTargets =
      getAllowedSwapTargets();

    if (allowedTargets.length > 0) {
      if (!transaction.to) {
        throw new ApiError(
          'The swap transaction has no target address.',
        );
      }

      if (
        !allowedTargets.includes(
          normalizeAddress(
            transaction.to,
          ),
        )
      ) {
        throw new ApiError(
          'The transaction used an unapproved swap target.',
          {
            status: 403,
          },
        );
      }
    }

    const {
      usdcSpent,
      tobyReceived,
    } = parseTransfers(
      receipt,
      authenticatedWallet,
    );

    if (
      usdcSpent < HOP_USDC_ATOMIC
    ) {
      throw new ApiError(
        `The transaction did not exchange the required USDC amount. Found ${usdcSpent.toString()} atomic USDC.`,
      );
    }

    if (tobyReceived <= 0n) {
      throw new ApiError(
        'No TOBY transfer to the hopper wallet was found.',
      );
    }

    const db = supabaseAdmin();

    const {
      data,
      error,
    } = await db.rpc(
      'toby_hop_record_verified_wallet',
      {
        p_wallet_address:
          normalizedWallet,
        p_transaction_hash:
          transactionHash.toLowerCase(),
        p_block_number:
          receipt.blockNumber.toString(),
        p_input_amount_atomic:
          usdcSpent.toString(),
        p_toby_amount_atomic:
          tobyReceived.toString(),
      },
    );

    if (error) {
      logDatabaseError(
        'toby_hop_record_verified_wallet RPC failed:',
        error,
        {
          wallet:
            normalizedWallet,
          transactionHash,
          blockNumber:
            receipt.blockNumber.toString(),
          usdcSpent:
            usdcSpent.toString(),
          tobyReceived:
            tobyReceived.toString(),
        },
      );

      /*
       * The RPC may have committed successfully
       * even if the request encountered a later
       * network or response error. Recover by hash.
       */
      const recovered =
        await getExistingHopByHash(
          transactionHash,
        );

      if (recovered) {
        if (
          !addressesMatch(
            recovered.wallet_address,
            authenticatedWallet,
          )
        ) {
          throw new ApiError(
            'This transaction was recorded for a different wallet.',
            {
              status: 403,
            },
          );
        }

        return jsonResponse(
          await existingHopToResponse(
            recovered,
            transactionHash,
          ),
        );
      }

      throw new ApiError(
        `Unable to record the verified hop: ${error.message}`,
        {
          status: 500,
        },
      );
    }

    const result =
      (
        Array.isArray(data)
          ? data[0]
          : data
      ) as VerifiedHopResult | null;

    if (
      !result ||
      !result.hop_id
    ) {
      console.error(
        'Unexpected verified-hop RPC response:',
        {
          data,
          transactionHash,
          wallet:
            normalizedWallet,
        },
      );

      throw new ApiError(
        'The database did not return a verified hop record.',
        {
          status: 500,
        },
      );
    }

    const profile =
      await getProfileByWallet(
        normalizedWallet,
      );

    const tobyDisplay =
      formatAtomic(
        tobyReceived,
        18,
        2,
      );

    const title =
      result.title_after ||
      'Pond Hopper';

    const castText =
      buildCast({
        displayName:
          profile?.display_name ?? null,
        username:
          profile?.username ?? null,
        streak:
          result.streak_after,
        totalHops:
          result.total_hops_after,
        tobyDisplay,
        dailyPosition:
          result.daily_position,
        title,
      });

    await updateHopCastText(
      result.hop_id,
      castText,
    );

    return jsonResponse({
      hopId:
        result.hop_id,
      tobyAtomic:
        tobyReceived.toString(),
      tobyDisplay,
      usdcAtomic:
        usdcSpent.toString(),
      streak:
        result.streak_after,
      totalHops:
        result.total_hops_after,
      dailyPosition:
        result.daily_position,
      title,
      castText,
      txHash:
        transactionHash,
      alreadyRecorded: false,
    });
  } catch (cause) {
    console.error(
      'POST /api/hop/verify failed:',
      cause,
    );

    if (cause instanceof ApiError) {
      return jsonResponse(
        {
          error: cause.message,
          retryable:
            cause.retryable,
        },
        cause.status,
      );
    }

    const message =
      cause instanceof Error
        ? cause.message
        : 'Unable to verify hop.';

    return jsonResponse(
      {
        error: message,
        retryable: false,
      },
      500,
    );
  }
}
