import {
  NextResponse,
} from 'next/server';
import {
  getAddress,
  isAddress,
} from 'viem';

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

function normalizeAddress(
  value: string,
): string {
  return value.toLowerCase();
}

function buildExistingHopFilter(
  wallet: string,
  fid?: number,
): string {
  const filters = [
    `wallet_address.eq.${normalizeAddress(wallet)}`,
  ];

  if (
    typeof fid === 'number' &&
    Number.isSafeInteger(fid) &&
    fid > 0
  ) {
    filters.push(
      `fid.eq.${fid}`,
    );
  }

  return filters.join(',');
}

export async function GET(
  request: Request,
) {
  try {
    /*
      This route trusts the Toby Hop app session cookie.

      Do not use requireFarcasterUser(request) here. That helper
      requires a Farcaster Quick Auth Bearer token, which should
      only be required by /api/auth/farcaster.
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

    assertTokenConfig();

    const url =
      new URL(
        request.url,
      );

    const walletParam =
      url.searchParams.get(
        'wallet',
      );

    if (
      !walletParam ||
      !isAddress(walletParam)
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid wallet.',
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

    const wallet =
      getAddress(
        walletParam,
      );

    const normalizedWallet =
      normalizeAddress(
        wallet,
      );

    /*
      Browser SIWE sessions always have an address.
      Farcaster sessions get an address when TobyHopApp calls
      /api/auth/farcaster with the connected wallet during hop.
    */
    if (
      !session.address ||
      normalizeAddress(
        session.address,
      ) !== normalizedWallet
    ) {
      return NextResponse.json(
        {
          error:
            'The requested wallet does not match the authenticated session.',
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

    const db =
      supabaseAdmin();

    const today =
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        );

    const {
      data: existing,
      error: existingError,
    } =
      await db
        .from(
          'toby_hops',
        )
        .select(
          'id',
        )
        .eq(
          'hop_day',
          today,
        )
        .or(
          buildExistingHopFilter(
            normalizedWallet,
            session.fid,
          ),
        )
        .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      return NextResponse.json(
        {
          error:
            'Today’s official hop is already complete.',
        },
        {
          status: 409,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    const apiKey =
      process.env
        .ZEROX_API_KEY;

    const baseUrl =
      process.env
        .ZEROX_API_BASE_URL ||
      'https://api.0x.org';

    if (!apiKey) {
      throw new Error(
        'ZEROX_API_KEY is not configured.',
      );
    }

    const params =
      new URLSearchParams({
        chainId:
          '8453',
        sellToken:
          USDC_ADDRESS,
        buyToken:
          TOBY_ADDRESS,
        sellAmount:
          HOP_USDC_ATOMIC
            .toString(),
        taker:
          wallet,
        slippageBps:
          '300',
      });

    const response =
      await fetch(
        `${baseUrl}/swap/allowance-holder/quote?${params.toString()}`,
        {
          method:
            'GET',
          headers: {
            '0x-api-key':
              apiKey,
            '0x-version':
              'v2',
          },
          cache:
            'no-store',
        },
      );

    if (!response.ok) {
      const providerError =
        await response.text();

      throw new Error(
        `Quote provider rejected the hop: ${providerError}`,
      );
    }

    const quote =
      await response.json();

    const allowanceTarget =
      quote.issues?.allowance?.spender ||
      quote.allowanceTarget;

    if (
      !allowanceTarget ||
      !quote.transaction
    ) {
      throw new Error(
        'The swap provider returned an incomplete quote.',
      );
    }

    return NextResponse.json(
      {
        allowanceTarget,
        transaction:
          quote.transaction,
        buyAmount:
          quote.buyAmount,
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
      'GET /api/hop/quote failed:',
      cause,
    );

    const message =
      cause instanceof Error
        ? cause.message
        : 'Unable to quote hop.';

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
