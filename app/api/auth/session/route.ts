import {
  NextResponse,
} from 'next/server';

import {
  requireCanonicalIdentity,
} from '@/lib/auth/canonical-identity';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic =
  'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control':
    'no-store, no-cache, must-revalidate',
};

export async function GET() {
  try {
    const identity =
      await requireCanonicalIdentity();

    let todayMeditated = false;
    let totalMeditations = 0;
    let totalPatienceAtomic = '0';

    if (identity.wallet || identity.fid) {
      const filters: string[] = [];
      if (identity.wallet) filters.push(`wallet_address.eq.${identity.wallet.toLowerCase()}`);
      if (identity.fid && identity.fid > 0) filters.push(`fid.eq.${identity.fid}`);
      const filter = filters.join(',');
      const db = supabaseAdmin();
      const today = new Date().toISOString().slice(0, 10);
      const [todayResult, meditationResult] = await Promise.all([
        db.from('toby_meditations').select('id').eq('meditation_day', today).or(filter).limit(1).maybeSingle(),
        db.from('toby_meditations').select('id,patience_amount_atomic').or(filter),
      ]);

      // Deploy-safe before the migration is applied: auth still works.
      if (!todayResult.error) todayMeditated = Boolean(todayResult.data);
      if (!meditationResult.error) {
        totalMeditations = meditationResult.data?.length ?? 0;
        totalPatienceAtomic = (meditationResult.data ?? [])
          .reduce((sum: bigint, row: { patience_amount_atomic?: string | null }) => sum + BigInt(row.patience_amount_atomic ?? '0'), 0n)
          .toString();
      }
    }

    return NextResponse.json(
      {
        authenticated: true,
        authMethod: identity.authMethod,
        fid: identity.fid,
        address: identity.wallet,
        user: identity.user
          ? { ...identity.user, today_meditated: todayMeditated, total_meditations: totalMeditations, total_patience_atomic: totalPatienceAtomic }
          : identity.user,
      },
      {
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : 'Unable to read session.';

    const lowered =
      message.toLowerCase();

    const authenticationError =
      lowered.includes(
        'authentication',
      ) ||
      lowered.includes(
        'session',
      ) ||
      lowered.includes(
        'unauthorized',
      );

    console.error(
      'GET /api/auth/session failed:',
      cause,
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
          authenticationError
            ? 401
            : 500,

        headers:
          NO_STORE_HEADERS,
      },
    );
  }
}
