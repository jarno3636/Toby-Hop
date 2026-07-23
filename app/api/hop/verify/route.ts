import {
  NextResponse,
} from 'next/server';
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
import {
  base,
} from 'viem/chains';

import {
  readAppSession,
} from '@/lib/auth/app-session';
import {
  assertTokenConfig,
  HOP_USDC_ATOMIC,
  TOBY_ADDRESS,
  USDC_ADDRESS,
} from '@/lib/contracts';
import {
  supabaseAdmin,
} from '@/lib/supabase/admin';
import {
  buildCast,
} from '@/lib/cast';
import {
  formatAtomic,
} from '@/lib/format';

const publicClient =
  createPublicClient({
    chain:
      base,
    transport:
      http(
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
  transaction_hash?: string | null;
  input_amount_atomic?: string | null;
  toby_amount_atomic?: string | null;
  streak_after?: number | null;
  total_hops_after?: number | null;
  daily_position?: number | null;
  title_after?: string | null;
  cast_text?: string | null;
};

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(
      resolve,
      milliseconds,
    );
  });
}

function normalizeAddress(
  value: string,
): string {
  return value.toLowerCase();
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

function getAllowedSwapTargets():
string[] {
  return (
    process.env
      .ALLOWED_SWAP_TARGETS ||
    ''
  )
    .split(',')
    .map((value) =>
      value
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

async function getReceiptSoon(
  hash: Hash,
): Promise<TransactionReceipt | null> {
  for (
    let attempt = 0;
    attempt < RECEIPT_LOOKUP_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const receipt =
        await publicClient
          .getTransactionReceipt({
            hash,
          });

      return receipt;
    } catch {
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
  const db =
    supabaseAdmin();

  const { data, error } =
    await db
      .from(
        'toby_hops',
      )
      .select(
        `
          id,
          transaction_hash,
          input_amount_atomic,
          toby_amount_atomic,
          streak_after,
          total_hops_after,
          daily_position,
          title_after,
          cast_text
        `,
      )
      .eq(
        'transaction_hash',
        transactionHash
          .toLowerCase(),
      )
      .maybeSingle();

  if (error) {
    return null;
  }

  return data as ExistingHopRow | null;
}

function existingHopToResponse(
  hop: ExistingHopRow,
  transactionHash: Hash,
) {
  const tobyAtomic =
    hop.toby_amount_atomic ??
    '0';

  const tobyDisplay =
    formatAtomic(
      BigInt(tobyAtomic),
      18,
      2,
    );

  return {
    hopId:
      hop.id,
    tobyAtomic,
    tobyDisplay,
    usdcAtomic:
      hop.input_amount_atomic ??
      HOP_USDC_ATOMIC.toString(),
    streak:
      hop.streak_after ??
      0,
    totalHops:
      hop.total_hops_after ??
      0,
    dailyPosition:
      hop.daily_position ??
      0,
    title:
      hop.title_after ??
      'Pond Hopper',
    castText:
      hop.cast_text ??
      'I hopped with Toby today.',
    txHash:
      transactionHash,
  };
}

export async function POST(
  request: Request,
) {
  try {
    const session =
      await readAppSession();

    if (!session) {
      return NextResponse.json(
        {
          error:
            'Authentication required.',
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

    if (!session.address) {
      return NextResponse.json(
        {
          error:
            'The authenticated session is missing a linked wallet.',
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

    assertTokenConfig();

    const body =
      (await request
        .json()
        .catch(
          () => ({}),
        )) as VerifyHopBody;

    if (
      !body.txHash ||
      !isHash(
        body.txHash,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid transaction hash.',
        },
        {
          status: 400,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    const transactionHash =
      body.txHash as Hash;

    const existingHop =
      await getExistingHopByHash(
        transactionHash,
      );

    if (existingHop) {
      return NextResponse.json(
        existingHopToResponse(
          existingHop,
          transactionHash,
        ),
        {
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    if (
      !body.walletAddress ||
      !isAddress(
        body.walletAddress,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid wallet address.',
        },
        {
          status: 400,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    const submittedWallet =
      getAddress(
        body.walletAddress,
      );

    const authenticatedWallet =
      getAddress(
        session.address,
      );

    if (
      !addressesMatch(
        submittedWallet,
        authenticatedWallet,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'The submitted wallet does not match the authenticated wallet.',
        },
        {
          status: 403,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    const receipt =
      await getReceiptSoon(
        transactionHash,
      );

    if (!receipt) {
      return NextResponse.json(
        {
          error:
            'The transaction is not indexed yet. Try verifying again.',
          retryable:
            true,
        },
        {
          status: 425,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    if (
      receipt.status !==
      'success'
    ) {
      throw new Error(
        'The swap transaction failed.',
      );
    }

    const transaction =
      await publicClient
        .getTransaction({
          hash:
            transactionHash,
        });

    if (
      !addressesMatch(
        transaction.from,
        authenticatedWallet,
      )
    ) {
      throw new Error(
        'The authenticated wallet did not send this transaction.',
      );
    }

    const allowedTargets =
      getAllowedSwapTargets();

    if (
      allowedTargets.length > 0
    ) {
      if (!transaction.to) {
        throw new Error(
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
        throw new Error(
          'The transaction used an unapproved swap target.',
        );
      }
    }

    let usdcSpent =
      0n;

    let tobyReceived =
      0n;

    const normalizedWallet =
      normalizeAddress(
        authenticatedWallet,
      );

    const normalizedUsdc =
      normalizeAddress(
        USDC_ADDRESS,
      );

    const normalizedToby =
      normalizeAddress(
        TOBY_ADDRESS,
      );

    for (const log of receipt.logs) {
      try {
        const decoded =
          decodeEventLog({
            abi:
              erc20Abi,
            data:
              log.data,
            topics:
              log.topics,
          });

        if (
          decoded.eventName !==
          'Transfer'
        ) {
          continue;
        }

        const args =
          decoded.args as {
            from: Address;
            to: Address;
            value: bigint;
          };

        const tokenAddress =
          normalizeAddress(
            log.address,
          );

        if (
          tokenAddress ===
            normalizedUsdc &&
          normalizeAddress(
            args.from,
          ) === normalizedWallet
        ) {
          usdcSpent +=
            args.value;
        }

        if (
          tokenAddress ===
            normalizedToby &&
          normalizeAddress(
            args.to,
          ) === normalizedWallet
        ) {
          tobyReceived +=
            args.value;
        }
      } catch {
        // Ignore non ERC-20 Transfer logs.
      }
    }

    if (
      usdcSpent <
      HOP_USDC_ATOMIC
    ) {
      throw new Error(
        `The transaction did not exchange the required USDC amount. Found ${usdcSpent.toString()} atomic USDC.`,
      );
    }

    if (
      tobyReceived <= 0n
    ) {
      throw new Error(
        'No TOBY transfer to the hopper wallet was found.',
      );
    }

    const db =
      supabaseAdmin();

    const {
      data,
      error,
    } =
      await db.rpc(
        'toby_hop_record_verified_wallet',
        {
          p_wallet_address:
            normalizedWallet,
          p_transaction_hash:
            transactionHash
              .toLowerCase(),
          p_block_number:
            Number(
              receipt.blockNumber,
            ),
          p_input_amount_atomic:
            usdcSpent
              .toString(),
          p_toby_amount_atomic:
            tobyReceived
              .toString(),
        },
      );

    if (error) {
      const recovered =
        await getExistingHopByHash(
          transactionHash,
        );

      if (recovered) {
        return NextResponse.json(
          existingHopToResponse(
            recovered,
            transactionHash,
          ),
          {
            headers: {
              'Cache-Control':
                'no-store',
            },
          },
        );
      }

      throw error;
    }

    const result =
      (
        Array.isArray(data)
          ? data[0]
          : data
      ) as
        | VerifiedHopResult
        | null;

    if (!result) {
      throw new Error(
        'The database did not return a verified hop record.',
      );
    }

    const {
      data: profile,
      error: profileError,
    } =
      await db
        .from(
          'toby_hop_users',
        )
        .select(
          `
            display_name,
            username
          `,
        )
        .eq(
          'wallet_address',
          normalizedWallet,
        )
        .maybeSingle();

    if (profileError) {
      console.error(
        'Unable to load hopper profile:',
        profileError,
      );
    }

    const tobyDisplay =
      formatAtomic(
        tobyReceived,
        18,
        2,
      );

    const castText =
      buildCast({
        displayName:
          profile
            ?.display_name ??
          null,
        username:
          profile
            ?.username ??
          null,
        streak:
          result
            .streak_after,
        totalHops:
          result
            .total_hops_after,
        tobyDisplay,
        dailyPosition:
          result
            .daily_position,
        title:
          result
            .title_after,
      });

    const {
      error: castUpdateError,
    } =
      await db
        .from(
          'toby_hops',
        )
        .update({
          cast_text:
            castText,
        })
        .eq(
          'id',
          result.hop_id,
        );

    if (castUpdateError) {
      console.error(
        'Unable to store cast text:',
        castUpdateError,
      );
    }

    return NextResponse.json(
      {
        hopId:
          result.hop_id,
        tobyAtomic:
          tobyReceived
            .toString(),
        tobyDisplay,
        usdcAtomic:
          usdcSpent
            .toString(),
        streak:
          result
            .streak_after,
        totalHops:
          result
            .total_hops_after,
        dailyPosition:
          result
            .daily_position,
        title:
          result
            .title_after,
        castText,
        txHash:
          transactionHash,
      },
      {
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  } catch (cause) {
    console.error(
      'POST /api/hop/verify failed:',
      cause,
    );

    const message =
      cause instanceof Error
        ? cause.message
        : 'Unable to verify hop.';

    const lowered =
      message.toLowerCase();

    const status =
      lowered.includes(
        'authentication',
      )
        ? 401
        : lowered.includes(
              'not indexed',
            )
          ? 425
          : 400;

    return NextResponse.json(
      {
        error:
          message,
        retryable:
          status === 425,
      },
      {
        status,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }
}
