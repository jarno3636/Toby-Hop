import { NextResponse } from 'next/server';

import { requireFarcasterUser } from '@/lib/auth/require-farcaster-user';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PondMemoryKind } from '@/lib/pond/event-memory';

export const dynamic = 'force-dynamic';

type MemoryRow = {
  memory_key: string;
  memory_kind: PondMemoryKind;
  seen_count: number | string;
  first_seen_at: string;
  last_seen_at: string;
};

type RecordBody = {
  key?: unknown;
  kind?: unknown;
  context?: unknown;
};

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}

function validKind(value: unknown): value is PondMemoryKind {
  return value === 'event' || value === 'chain';
}

function cleanKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9:_-]{0,79}$/.test(cleaned) ? cleaned : null;
}

function cleanContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const allowed = ['dayKey', 'weather', 'season', 'mood', 'themeId', 'moonPhase', 'macroEventKey'];
  return Object.fromEntries(
    allowed
      .filter((key) => typeof source[key] === 'string' || source[key] === null)
      .map((key) => [key, source[key]]),
  );
}

export async function GET(request: Request) {
  try {
    const { fid } = await requireFarcasterUser(request);
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('toby_hop_event_memory')
      .select('memory_key,memory_kind,seen_count,first_seen_at,last_seen_at')
      .eq('fid', fid)
      .order('last_seen_at', { ascending: false })
      .limit(250);

    if (error) throw new Error(error.message);

    const items = ((data ?? []) as MemoryRow[]).map((row) => ({
      key: row.memory_key,
      kind: row.memory_kind,
      seenCount: Number(row.seen_count) || 0,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    }));

    return noStore({ items });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to load pond memory.';
    return noStore({ error: message, items: [] }, message.toLowerCase().includes('authorization') ? 401 : 500);
  }
}

export async function POST(request: Request) {
  try {
    const { fid } = await requireFarcasterUser(request);
    const body = (await request.json()) as RecordBody;
    const key = cleanKey(body.key);
    const kind = validKind(body.kind) ? body.kind : null;

    if (!key || !kind) return noStore({ error: 'A valid memory key and kind are required.' }, 400);

    const db = supabaseAdmin();
    const { error } = await db.rpc('toby_hop_record_event_memory', {
      p_fid: fid,
      p_memory_key: key,
      p_memory_kind: kind,
      p_context: cleanContext(body.context),
    });

    if (error) throw new Error(error.message);
    return noStore({ ok: true });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to record pond memory.';
    return noStore({ error: message }, message.toLowerCase().includes('authorization') ? 401 : 500);
  }
}
