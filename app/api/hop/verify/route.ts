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
} from 'viem';
import { base } from 'viem/chains';

import { requireWalletSession } from '@/lib/auth/require-wallet-session';
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

function getAllowedSwapTargets(): string[] {
  return (
    process.env.ALLOWED_SWAP_TARGETS || ''
  )
    .split(',')
    .map((value) =>
      value.trim().toLowerCase(),
    )
    .filter(Boolean);
}

export async function POST(
  request: Request,
) {
  try {
    /*
      The authenticated identity now comes from the secure
      HTTP-only SIWE wallet session, not Farcaster context.
    */
    const session =
      await requireWalletSession();

    assertTokenConfig();

    const body =
      (await request.json()) as VerifyHopBody;

    if (
      !body.txHash ||
      !isHash(body.txHash)
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid transaction hash.',
        },
        {
          status: 400,
        },
      );
    }

    if (
      !body.walletAddress ||
      !isAddress(body.walletAddress)
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid wallet address.',
        },
        {
          status: 400,
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

    /*
      A user may only submit a transaction for the wallet
      that authenticated through SIWE.
    */
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
        },
      );
    }

    const transactionHash =
      body.txHash as Hash;

    /*
      Wait for the Base transaction to be mined and receive
      two confirmations before updating any records.
    */
    const receipt =
      await publicClient
        .waitForTransactionReceipt({
          hash: transactionHash,
          confirmations: 2,
          timeout: 120_000,
        });

    if (
      receipt.status !== 'success'
    ) {
      throw new Error(
        'The swap transaction failed.',
      );
    }

    const transaction =
      await publicClient
        .getTransaction({
          hash: transactionHash,
        });

    /*
      Confirm that the authenticated wallet actually submitted
      the transaction.
    */
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

    /*
      Optionally restrict accepted swaps to known router contracts.

      Example:

      ALLOWED_SWAP_TARGETS=0xRouterOne,0xRouterTwo

      Leave the variable empty during initial development.
      Configure it before production launch.
    */
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

    let usdcSpent = 0n;
    let tobyReceived = 0n;

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

    /*
      Read the confirmed ERC-20 Transfer logs.

      The browser does not tell the server how much was exchanged
      or received. The server derives those amounts from Base.
    */
    for (
      const log of receipt.logs
    ) {
      try {
        const decoded =
          decodeEventLog({
            abi: erc20Abi,
            data: log.data,
            topics: log.topics,
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

        /*
          Count USDC transferred out of the hopper wallet.
        */
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

        /*
          Count TOBY transferred directly into the hopper wallet.
        */
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
        /*
          Receipts may contain logs from routers, pools and other
          contracts. Ignore anything that is not an ERC-20 Transfer.
        */
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

    if (tobyReceived <= 0n) {
      throw new Error(
        'No TOBY transfer to the hopper wallet was found.',
      );
    }

    const db =
      supabaseAdmin();

    /*
      This wallet-based database function atomically:

      - prevents duplicate transaction hashes
      - permits one official hop per wallet per UTC day
      - calculates the streak
      - calculates the daily hopper position
      - adds one Big Pond Energy
      - updates lifetime USDC and TOBY totals
      - assigns the current title
    */
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
          Number(
            receipt.blockNumber,
          ),

        p_input_amount_atomic:
          usdcSpent.toString(),

        p_toby_amount_atomic:
          tobyReceived.toString(),
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

    /*
      Load the optional profile information associated with
      this wallet. A wallet-only user may simply be shown as
      "Hopper", but an FID is never inserted into the cast.
    */
    const {
      data: profile,
      error: profileError,
    } = await db
      .from('toby_hop_users')
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

    /*
      TOBY currently uses 18 decimals.
    */
    const tobyDisplay =
      formatAtomic(
        tobyReceived,
        18,
        2,
      );

    /*
      Cast language remains playful and never exposes technical
      identifiers such as an FID or complete wallet address.
    */
    const castText =
      buildCast({
        displayName:
          profile?.display_name ??
          null,

        username:
          profile?.username ??
          null,

        streak:
          result.streak_after,

        totalHops:
          result.total_hops_after,

        tobyDisplay,

        dailyPosition:
          result.daily_position,

        title:
          result.title_after,
      });

    const {
      error:
        castUpdateError,
    } = await db
      .from('toby_hops')
      .update({
        cast_text: castText,
      })
      .eq(
        'id',
        result.hop_id,
      );

    /*
      Storing the cast text is helpful but not critical enough
      to invalidate an otherwise verified hop.
    */
    if (castUpdateError) {
      console.error(
        'Unable to store cast text:',
        castUpdateError,
      );
    }

    return NextResponse.json({
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

      title:
        result.title_after,

      castText,

      txHash:
        transactionHash,
    });
  } catch (cause) {
    console.error(
      'Toby Hop verification error:',
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
        error: message,
      },
      {
        status,
      },
    );
  }
}
