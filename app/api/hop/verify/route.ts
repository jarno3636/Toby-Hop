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

export async function POST(
  request: Request,
) {
  try {
    /*
      This route trusts the Toby Hop app session cookie.

      Do not use requireFarcasterUser(request) here. That helper
      requires a Farcaster Quick Auth Bearer token.

      Do not require SIWE only here either. Farcaster hops create
      a valid app session with authMethod "farcaster", fid, and
      the connected wallet address.
    */
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

    const transactionHash =
      body.txHash as Hash;

    const receipt =
      await publicClient
        .waitForTransactionReceipt({
          hash:
            transactionHash,
          confirmations:
            2,
          timeout:
            120_000,
        });

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

    for (
      const log of receipt.logs
    ) {
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
        'The transaction did not exchange the required USDC amount.',
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
      error:
        profileError,
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
      error:
        castUpdateError,
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

    const status =
      message
        .toLowerCase()
        .includes(
          'authentication',
        )
        ? 401
        : 400;

    return NextResponse.json(
      {
        error:
          message,
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
