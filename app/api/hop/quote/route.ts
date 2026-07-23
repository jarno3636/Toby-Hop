import {
  NextResponse,
} from 'next/server';

import {
  getAddress,
  isAddress,
} from 'viem';

import {
  requireCanonicalIdentity,
  requireRequestedHopWallet,
} from '@/lib/auth/canonical-identity';

import {
  assertTokenConfig,
  HOP_USDC_ATOMIC,
  TOBY_ADDRESS,
  USDC_ADDRESS,
} from '@/lib/contracts';

import {
  supabaseAdmin,
} from '@/lib/supabase/admin';

const QUOTE_ATTEMPTS = 5;
const QUOTE_TIMEOUT_MS = 9_000;

const QUOTE_RETRY_DELAY_MS = [
  0,
  600,
  1_200,
  2_000,
  3_000,
];

const NO_STORE_HEADERS = {
  'Cache-Control':
    'no-store',
};

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

function buildExistingHopFilter(
  wallet: string,
  fid: number | null,
): string {
  const filters = [
    `wallet_address.eq.${wallet.toLowerCase()}`,
  ];

  if (
    fid &&
    Number.isSafeInteger(fid) &&
    fid > 0
  ) {
    filters.push(
      `fid.eq.${fid}`,
    );
  }

  return filters.join(',');
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    return await fetch(
      url,
      {
        ...init,
        signal:
          controller.signal,
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

function isRetryableQuoteStatus(
  status: number,
): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

async function fetchQuoteWithRetry(
  quoteUrl: string,
  apiKey: string,
): Promise<unknown> {
  let lastMessage =
    'Unable to get a swap quote.';

  for (
    let attempt = 0;
    attempt < QUOTE_ATTEMPTS;
    attempt += 1
  ) {
    const delay =
      QUOTE_RETRY_DELAY_MS[
        attempt
      ] ?? 0;

    if (delay > 0) {
      await sleep(delay);
    }

    try {
      const response =
        await fetchWithTimeout(
          quoteUrl,
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

          QUOTE_TIMEOUT_MS,
        );

      const raw =
        await response.text();

      if (response.ok) {
        if (!raw.trim()) {
          throw new Error(
            'The quote provider returned an empty response.',
          );
        }

        return JSON.parse(
          raw,
        ) as unknown;
      }

      lastMessage =
        raw.trim()
          ? `Quote provider rejected the hop: ${raw}`
          : `Quote provider rejected the hop with status ${response.status}.`;

      if (
        !isRetryableQuoteStatus(
          response.status,
        )
      ) {
        break;
      }
    } catch (cause) {
      lastMessage =
        cause instanceof Error
          ? cause.message
          : 'The quote provider did not respond.';
    }
  }

  throw new Error(
    lastMessage,
  );
}

export async function GET(
  request: Request,
) {
  try {
    const identity =
      await requireCanonicalIdentity();

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
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    const wallet =
      requireRequestedHopWallet(
        identity,
        walletParam,
      );

    const db =
      supabaseAdmin();

    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    const {
      data: existing,
      error: existingError,
    } =
      await db
        .from('toby_hops')
        .select('id')
        .eq(
          'hop_day',
          today,
        )
        .or(
          buildExistingHopFilter(
            wallet,
            identity.fid,
          ),
        )
        .limit(1)
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
          headers:
            NO_STORE_HEADERS,
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

    const quoteUrl =
      `${baseUrl}/swap/allowance-holder/quote?${params.toString()}`;

    const quote =
      await fetchQuoteWithRetry(
        quoteUrl,
        apiKey,
      ) as {
        allowanceTarget?: unknown;
        buyAmount?: unknown;
        issues?: {
          allowance?: {
            spender?: unknown;
          };
        };
        transaction?: {
          to?: unknown;
          data?: unknown;
          value?: unknown;
          gas?: unknown;
        };
      };

    const allowanceTarget =
      quote.issues
        ?.allowance
        ?.spender ??
      quote.allowanceTarget;

    if (
      typeof allowanceTarget !==
        'string' ||
      !isAddress(
        allowanceTarget,
      )
    ) {
      throw new Error(
        'The swap provider returned an invalid allowance target.',
      );
    }

    if (
      !quote.transaction ||
      typeof quote.transaction.to !==
        'string' ||
      !isAddress(
        quote.transaction.to,
      ) ||
      typeof quote.transaction.data !==
        'string' ||
      !quote.transaction.data.startsWith(
        '0x',
      )
    ) {
      throw new Error(
        'The swap provider returned an incomplete quote.',
      );
    }

    return NextResponse.json(
      {
        allowanceTarget:
          getAddress(
            allowanceTarget,
          ),

        transaction:
          quote.transaction,

        buyAmount:
          typeof quote.buyAmount ===
            'string'
            ? quote.buyAmount
            : '0',
      },
      {
        headers:
          NO_STORE_HEADERS,
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

    const lowered =
      message.toLowerCase();

    const status =
      lowered.includes(
        'authentication',
      ) ||
      lowered.includes(
        'session',
      ) ||
      lowered.includes(
        'farcaster identity',
      )
        ? 401
        : lowered.includes(
              'does not match',
            )
          ? 403
          : lowered.includes(
                'quote provider',
              ) ||
              lowered.includes(
                'aborted',
              ) ||
              lowered.includes(
                'did not respond',
              )
            ? 503
            : 400;

    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }
}
