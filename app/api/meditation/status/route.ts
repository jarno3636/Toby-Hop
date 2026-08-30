import { NextResponse } from 'next/server';
import { requireCanonicalIdentity } from '@/lib/auth/canonical-identity';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatAtomic } from '@/lib/format';

export const dynamic = 'force-dynamic';

function identityFilter(wallet: string | null, fid: number | null): string {
  const filters: string[] = [];
  if (wallet) filters.push(`wallet_address.eq.${wallet.toLowerCase()}`);
  if (fid && fid > 0) filters.push(`fid.eq.${fid}`);
  return filters.join(',');
}

export async function GET() {
  try {
    const identity = await requireCanonicalIdentity();
    const filter = identityFilter(identity.wallet, identity.fid);
    if (!filter) throw new Error('No session identity is available.');

    const db = supabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    const [todayResult, meditationResult] = await Promise.all([
      db.from('toby_meditations').select('id').eq('meditation_day', today).or(filter).limit(1).maybeSingle(),
      db.from('toby_meditations').select('id,patience_amount_atomic').or(filter),
    ]);

    if (todayResult.error) throw todayResult.error;
    if (meditationResult.error) throw meditationResult.error;

    const totalPatienceAtomic = (meditationResult.data ?? [])
      .reduce((sum: bigint, row: { patience_amount_atomic?: string | null }) => sum + BigInt(row.patience_amount_atomic ?? '0'), 0n)
      .toString();

    return NextResponse.json({
      todayMeditated: Boolean(todayResult.data),
      totalMeditations: meditationResult.data?.length ?? 0,
      totalPatienceAtomic,
      totalPatienceDisplay: formatAtomic(totalPatienceAtomic, 18, 8),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to load stillness status.';
    return NextResponse.json({ error: message }, { status: message.toLowerCase().includes('auth') ? 401 : 500 });
  }
}
