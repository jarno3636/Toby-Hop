import { NextResponse } from 'next/server';
import { clearWalletSession } from '@/lib/auth/wallet-session';

export async function POST() {
  await clearWalletSession();

  return NextResponse.json({
    authenticated: false,
  });
}
