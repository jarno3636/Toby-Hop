import { NextResponse } from 'next/server';
import { generateSiweNonce } from 'viem/siwe';
import { storeSiweNonce } from '@/lib/auth/wallet-session';

export async function GET() {
  const nonce =
    generateSiweNonce();

  await storeSiweNonce(nonce);

  return NextResponse.json(
    {
      nonce,
    },
    {
      headers: {
        'cache-control':
          'no-store, max-age=0',
      },
    },
  );
}
