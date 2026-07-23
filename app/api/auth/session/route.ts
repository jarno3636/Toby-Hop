import { NextResponse } from 'next/server';

import {
  requireAppSession,
} from '@/lib/auth/require-app-session';
import {
  supabaseAdmin,
} from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session =
      await requireAppSession();

    const db =
      supabaseAdmin();

    let user:
      Record<string, unknown> | null =
      null;

    /*
     * A Farcaster identity should be resolved by FID first.
     * This works even before a wallet has been linked.
     */
    if (
      typeof session.fid ===
        'number' &&
      Number.isSafeInteger(
        session.fid,
      ) &&
      session.fid > 0
    ) {
      const {
        data,
        error,
      } =
        await db
          .from(
            'toby_hop_users',
          )
          .select('*')
          .eq(
            'fid',
            session.fid,
          )
          .maybeSingle();

      if (error) {
        throw error;
      }

      user =
        data;
    }

    /*
     * SIWE sessions and older Farcaster records may need
     * to be resolved by wallet address.
     */
    if (
      !user &&
      session.address
    ) {
      const normalizedAddress =
        session.address.toLowerCase();

      const {
        data,
        error,
      } =
        await db
          .from(
            'toby_hop_users',
          )
          .select('*')
          .ilike(
            'wallet_address',
            normalizedAddress,
          )
          .maybeSingle();

      if (error) {
        throw error;
      }

      user =
        data;
    }

    return NextResponse.json(
      {
        authenticated:
          true,

        authMethod:
          session.authMethod ??
          (
            session.fid
              ? 'farcaster'
              : session.address
                ? 'siwe'
                : null
          ),

        fid:
          session.fid ??
          (
            typeof user?.fid ===
              'number'
              ? user.fid
              : null
          ),

        address:
          session.address ??
          (
            typeof user?.wallet_address ===
              'string'
              ? user.wallet_address
              : null
          ),

        user,
      },
      {
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : 'Unable to read session.';

    const isAuthenticationError =
      message
        .toLowerCase()
        .includes(
          'session',
        ) ||
      message
        .toLowerCase()
        .includes(
          'authenticated',
        ) ||
      message
        .toLowerCase()
        .includes(
          'unauthorized',
        );

    return NextResponse.json(
      {
        authenticated:
          false,

        authMethod:
          null,

        fid:
          null,

        address:
          null,

        user:
          null,

        error:
          message,
      },
      {
        status:
          isAuthenticationError
            ? 401
            : 500,

        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate',
        },
      },
    );
  }
}
