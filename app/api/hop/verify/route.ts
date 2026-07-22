import { NextResponse } from 'next/server';
import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  http,
  isAddress,
  isHash,
} from 'viem';
import { base } from 'viem/chains';
import { requireFarcasterUser } from '@/lib/auth/require-farcaster-user';
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
  transport: http(process.env.BASE_RPC_URL),
});

function lower(value: string): string {
  return value.toLowerCase();
}

export async function POST(request: Request) {
  try {
    const auth = await requireFarcasterUser(request);

    assertTokenConfig();

    const body = (await request.json()) as {
      txHash?: string;
      walletAddress?: string;
    };

    if (!body.txHash || !isHash(body.txHash)) {
      return new NextResponse(
        'Invalid transaction hash.',
        { status: 400 },
      );
    }

    if (
      !body.walletAddress ||
      !isAddress(body.walletAddress)
    ) {
      return new NextResponse(
        'Invalid wallet address.',
        { status: 400 },
      );
    }

    /*
      Wait until the Base transaction is mined and has at least
      two confirmations.
    */
    const receipt =
      await publicClient.waitForTransactionReceipt({
        hash: body.txHash as `0x${string}`,
        confirmations: 2,
      });

    if (receipt.status !== 'success') {
      throw new Error('The swap transaction failed.');
    }

    const transaction =
      await publicClient.getTransaction({
        hash: body.txHash as `0x${string}`,
      });

    /*
      Make sure the submitted wallet actually sent the transaction.
    */
    if (
      lower(transaction.from) !==
      lower(body.walletAddress)
    ) {
      throw new Error(
        'The submitted wallet did not send this transaction.',
      );
    }

    /*
      Optionally restrict accepted transactions to known 0x router
      or allowance-holder addresses.

      Add comma-separated addresses to ALLOWED_SWAP_TARGETS.
    */
    const allowedTargets = (
      process.env.ALLOWED_SWAP_TARGETS || ''
    )
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (
      allowedTargets.length > 0 &&
      (
        !transaction.to ||
        !allowedTargets.includes(lower(transaction.to))
      )
    ) {
      throw new Error(
        'The transaction used an unapproved swap target.',
      );
    }

    let usdcSpent = 0n;
    let tobyReceived = 0n;

    /*
      Read ERC-20 Transfer events directly from the confirmed
      transaction receipt.

      We do not trust amounts reported by the browser.
    */
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: erc20Abi,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName !== 'Transfer') {
          continue;
        }

        const args = decoded.args as {
          from: `0x${string}`;
          to: `0x${string}`;
          value: bigint;
        };

        const tokenAddress = lower(log.address);
        const walletAddress = lower(body.walletAddress);

        if (
          tokenAddress === lower(USDC_ADDRESS) &&
          lower(args.from) === walletAddress
        ) {
          usdcSpent += args.value;
        }

        if (
          tokenAddress === lower(TOBY_ADDRESS) &&
          lower(args.to) === walletAddress
        ) {
          tobyReceived += args.value;
        }
      } catch {
        /*
          Ignore logs that are not compatible ERC-20 Transfer events.
        */
      }
    }

    if (usdcSpent < HOP_USDC_ATOMIC) {
      throw new Error(
        'The transaction did not exchange the required USDC amount.',
      );
    }

    if (tobyReceived <= 0n) {
      throw new Error(
        'No $TOBY transfer to the hopper was found.',
      );
    }

    const db = supabaseAdmin();

    /*
      The database function atomically:

      - Prevents duplicate transaction hashes
      - Prevents more than one official hop per FID per day
      - Calculates streaks
      - Calculates daily position
      - Awards Big Pond Energy
      - Updates lifetime totals
      - Assigns a title
    */
    const { data, error } = await db.rpc(
      'toby_hop_record_verified',
      {
        p_fid: auth.fid,
        p_username: auth.username ?? null,
        p_display_name: auth.displayName ?? null,
        p_pfp_url: auth.pfpUrl ?? null,
        p_wallet_address: lower(body.walletAddress),
        p_transaction_hash: lower(body.txHash),
        p_block_number: Number(receipt.blockNumber),
        p_input_amount_atomic: usdcSpent.toString(),
        p_toby_amount_atomic: tobyReceived.toString(),
      },
    );

    if (error) {
      throw error;
    }

    const result = Array.isArray(data)
      ? data[0]
      : data;

    if (!result) {
      throw new Error(
        'The database did not return a hop record.',
      );
    }

    /*
      The current Toby token is expected to use 18 decimals.
    */
    const tobyDisplay = formatAtomic(
      tobyReceived,
      18,
      2,
    );

    const castText = buildCast({
      displayName:
        auth.displayName ||
        auth.username ||
        `FID ${auth.fid}`,
      streak: result.streak_after,
      totalHops: result.total_hops_after,
      tobyDisplay,
      dailyPosition: result.daily_position,
      title: result.title_after,
    });

    const { error: castUpdateError } = await db
      .from('toby_hops')
      .update({
        cast_text: castText,
      })
      .eq('id', result.hop_id);

    if (castUpdateError) {
      console.error(
        'Unable to store cast text:',
        castUpdateError,
      );
    }

    return NextResponse.json({
      hopId: result.hop_id,
      tobyAtomic: tobyReceived.toString(),
      tobyDisplay,
      streak: result.streak_after,
      totalHops: result.total_hops_after,
      dailyPosition: result.daily_position,
      title: result.title_after,
      castText,
      txHash: body.txHash,
    });
  } catch (cause) {
    return new NextResponse(
      cause instanceof Error
        ? cause.message
        : 'Unable to verify hop.',
      { status: 400 },
    );
  }
}
