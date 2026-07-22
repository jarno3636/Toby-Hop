import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { requireFarcasterUser } from '@/lib/auth/require-farcaster-user';
import {
  assertTokenConfig,
  HOP_USDC_ATOMIC,
  TOBY_ADDRESS,
  USDC_ADDRESS,
} from '@/lib/contracts';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const user = await requireFarcasterUser(request);

    assertTokenConfig();

    const url = new URL(request.url);
    const wallet = url.searchParams.get('wallet');

    if (!wallet || !isAddress(wallet)) {
      return new NextResponse('Invalid wallet.', {
        status: 400,
      });
    }

    const db = supabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    /*
      Check before producing a quote so users who already completed
      today's official hop do not start another transaction by mistake.
    */
    const { data: existing, error: existingError } = await db
      .from('toby_hops')
      .select('id')
      .eq('fid', user.fid)
      .eq('hop_day', today)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      return new NextResponse(
        'Today’s official hop is already complete.',
        { status: 409 },
      );
    }

    const apiKey = process.env.ZEROX_API_KEY;
    const baseUrl =
      process.env.ZEROX_API_BASE_URL || 'https://api.0x.org';

    if (!apiKey) {
      throw new Error('ZEROX_API_KEY is not configured.');
    }

    const params = new URLSearchParams({
      chainId: '8453',
      sellToken: USDC_ADDRESS,
      buyToken: TOBY_ADDRESS,
      sellAmount: HOP_USDC_ATOMIC.toString(),
      taker: wallet,
      slippageBps: '300',
    });

    const response = await fetch(
      `${baseUrl}/swap/allowance-holder/quote?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          '0x-api-key': apiKey,
          '0x-version': 'v2',
        },
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      const providerError = await response.text();

      throw new Error(
        `Quote provider rejected the hop: ${providerError}`,
      );
    }

    const quote = await response.json();

    const allowanceTarget =
      quote.issues?.allowance?.spender ||
      quote.allowanceTarget;

    if (!allowanceTarget || !quote.transaction) {
      throw new Error(
        'The swap provider returned an incomplete quote.',
      );
    }

    return NextResponse.json({
      allowanceTarget,
      transaction: quote.transaction,
      buyAmount: quote.buyAmount,
    });
  } catch (cause) {
    return new NextResponse(
      cause instanceof Error
        ? cause.message
        : 'Unable to quote hop.',
      { status: 400 },
    );
  }
}
