import {
  NextResponse,
} from 'next/server';
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import {
  parseSiweMessage,
} from 'viem/siwe';

import {
  consumeSiweNonce,
  createWalletSession,
} from '@/lib/auth/wallet-session';
import {
  supabaseAdmin,
} from '@/lib/supabase/admin';

const publicClient =
  createPublicClient({
    chain: base,

    transport: http(
      process.env.BASE_RPC_URL ||
        'https://mainnet.base.org',
    ),
  });

type VerifyBody = {
  message?: string;
  signature?: Hex;
};

function getConfiguredAppUrl():
URL {
  return new URL(
    process.env
      .NEXT_PUBLIC_APP_URL ||
      'https://tobyhop.vercel.app',
  );
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as VerifyBody;

    if (
      !body.message ||
      !body.signature
    ) {
      return NextResponse.json(
        {
          error:
            'Message and signature are required.',
        },
        {
          status: 400,
        },
      );
    }

    const parsed =
      parseSiweMessage(
        body.message,
      );

    if (
      !parsed.address ||
      !isAddress(
        parsed.address,
      )
    ) {
      throw new Error(
        'Invalid wallet address.',
      );
    }

    const expectedNonce =
      await consumeSiweNonce();

    if (
      !expectedNonce ||
      parsed.nonce !==
        expectedNonce
    ) {
      throw new Error(
        'The sign-in nonce is invalid or expired.',
      );
    }

    const appUrl =
      getConfiguredAppUrl();

    if (
      parsed.domain !==
      appUrl.host
    ) {
      throw new Error(
        'The sign-in domain is invalid.',
      );
    }

    if (
      parsed.uri !==
      appUrl.origin
    ) {
      throw new Error(
        'The sign-in URI is invalid.',
      );
    }

    if (
      parsed.chainId !==
      base.id
    ) {
      throw new Error(
        'Toby Hop requires Base mainnet.',
      );
    }

    const address =
      getAddress(
        parsed.address,
      );

    const verified =
      await publicClient
        .verifySiweMessage({
          message:
            body.message,

          signature:
            body.signature,

          domain:
            appUrl.host,

          nonce:
            expectedNonce,

          address,
        });

    if (!verified) {
      throw new Error(
        'Wallet signature verification failed.',
      );
    }

    const db =
      supabaseAdmin();

    const {
      data,
      error,
    } =
      await db.rpc(
        'toby_hop_get_or_create_wallet_user',
        {
          p_wallet_address:
            address.toLowerCase(),
        },
      );

    if (error) {
      throw error;
    }

    await createWalletSession({
      address,
      chainId: 8453,
    });

    return NextResponse.json({
      authenticated: true,
      authMethod: 'siwe',
      address,
      user: data,
    });
  } catch (cause) {
    return NextResponse.json(
      {
        authenticated:
          false,

        error:
          cause instanceof Error
            ? cause.message
            : 'Wallet authentication failed.',
      },
      {
        status: 401,
      },
    );
  }
}
