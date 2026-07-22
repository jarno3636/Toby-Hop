import { NextResponse } from 'next/server';
import { readWalletSession } from '@/lib/auth/wallet-session';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const session =
      await readWalletSession();

    if (!session) {
      return NextResponse.json({
        authenticated: false,
        user: null,
      });
    }

    const db =
      supabaseAdmin();

    const { data, error } =
      await db
        .from('toby_hop_users')
        .select('*')
        .eq(
          'wallet_address',
          session.address.toLowerCase(),
        )
        .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      authenticated: true,
      address:
        session.address,
      user: data,
    });
  } catch (cause) {
    return NextResponse.json(
      {
        authenticated: false,
        user: null,
        error:
          cause instanceof Error
            ? cause.message
            : 'Unable to read session.',
      },
      {
        status: 401,
      },
    );
  }
}
