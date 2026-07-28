import { NextResponse } from 'next/server';

import { requireCanonicalIdentity } from '@/lib/auth/canonical-identity';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type {
  PondFind,
  PondJournal,
  PondJournalEntry,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

type UserFindRow = {
  encounter_key: string;
  name: string;
  description: string;
  rarity: PondFind['rarity'];
  visual_key: string;
  times_found: number | string | null;
  first_found_at: string;
  last_found_at: string;
};

type EncounterRow = {
  id: string;
  hop_id: string;
  encounter_key: string;
  name: string;
  description: string;
  category: PondJournalEntry['category'];
  rarity: PondJournalEntry['rarity'];
  visual_key: string;
  reward_xp: number | string | null;
  first_discovery: boolean;
  created_at: string;
};

function clean(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim();

  return cleaned
    ? cleaned.slice(0, maxLength)
    : null;
}

function numberFromUnknown(
  value: unknown,
): number {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function authStatus(message: string): number {
  const lowered = message.toLowerCase();

  return lowered.includes('authentication') ||
    lowered.includes('session')
    ? 401
    : 500;
}

export async function GET() {
  try {
    const identity = await requireCanonicalIdentity();

    if (!identity.fid) {
      const emptyJournal: PondJournal = {
        availableDiscoveries: 0,
        uniqueDiscoveries: 0,
        rareDiscoveries: 0,
        secretDiscoveries: 0,
        totalDiscoveryXp: 0,
        recentFinds: [],
        recentEntries: [],
      };

      return NextResponse.json(emptyJournal, {
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    }

    const db = supabaseAdmin();

    const [
      definitionsResult,
      findsResult,
      encountersResult,
      xpResult,
    ] = await Promise.all([
      db
        .from('toby_hop_encounter_definitions')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('enabled', true),

      db
        .from('toby_hop_user_finds')
        .select(`
          encounter_key,
          name,
          description,
          rarity,
          visual_key,
          times_found,
          first_found_at,
          last_found_at
        `)
        .eq('fid', identity.fid)
        .order('last_found_at', {
          ascending: false,
        }),

      db
        .from('toby_hop_encounters')
        .select(`
          id,
          hop_id,
          encounter_key,
          name,
          description,
          category,
          rarity,
          visual_key,
          reward_xp,
          first_discovery,
          created_at
        `)
        .eq('fid', identity.fid)
        .order('created_at', {
          ascending: false,
        })
        .limit(12),

      db
        .from('toby_hop_encounters')
        .select('reward_xp')
        .eq('fid', identity.fid)
        .limit(10_000),
    ]);

    if (definitionsResult.error) {
      throw new Error(
        `Unable to load discovery catalog: ${definitionsResult.error.message}`,
      );
    }

    if (findsResult.error) {
      throw new Error(
        `Unable to load pond finds: ${findsResult.error.message}`,
      );
    }

    if (encountersResult.error) {
      throw new Error(
        `Unable to load pond journal: ${encountersResult.error.message}`,
      );
    }

    if (xpResult.error) {
      throw new Error(
        `Unable to total discovery XP: ${xpResult.error.message}`,
      );
    }

    const findRows =
      (findsResult.data ?? []) as UserFindRow[];

    const encounterRows =
      (encountersResult.data ?? []) as EncounterRow[];

    const recentFinds: PondFind[] = findRows
      .slice(0, 8)
      .map((row) => ({
        key: row.encounter_key,
        name: row.name,
        description: row.description,
        rarity: row.rarity,
        visualKey: row.visual_key,
        timesFound: numberFromUnknown(row.times_found),
        firstFoundAt: row.first_found_at,
        lastFoundAt: row.last_found_at,
      }));

    const recentEntries: PondJournalEntry[] =
      encounterRows.map((row) => ({
        id: row.id,
        hopId: row.hop_id,
        key: row.encounter_key,
        name: row.name,
        description: row.description,
        category: row.category,
        rarity: row.rarity,
        visualKey: row.visual_key,
        rewardXp: numberFromUnknown(row.reward_xp),
        firstDiscovery: row.first_discovery,
        createdAt: row.created_at,
      }));

    const rareDiscoveries = findRows.filter(
      (row) =>
        row.rarity === 'rare' ||
        row.rarity === 'legendary',
    ).length;

    const secretDiscoveries = findRows.filter(
      (row) => row.rarity === 'secret',
    ).length;

    const totalDiscoveryXp = (xpResult.data ?? []).reduce(
      (total, row) =>
        total + numberFromUnknown(row.reward_xp),
      0,
    );

    const journal: PondJournal = {
      availableDiscoveries:
        definitionsResult.count ?? 0,
      uniqueDiscoveries: findRows.length,
      rareDiscoveries,
      secretDiscoveries,
      totalDiscoveryXp,
      recentFinds,
      recentEntries,
    };

    return NextResponse.json(journal, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : 'Unable to load your pond journal.';

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: authStatus(message),
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireCanonicalIdentity();

    const body = await request
      .json()
      .catch(() => ({}));

    const updates = {
      username: clean(body.username, 64),
      display_name: clean(body.displayName, 100),
      pfp_url: clean(body.pfpUrl, 1_000),
      updated_at: new Date().toISOString(),
    };

    const db = supabaseAdmin();

    let query = db
      .from('toby_hop_users')
      .update(updates);

    if (identity.fid) {
      query = query.eq('fid', identity.fid);
    } else if (identity.wallet) {
      query = query.ilike(
        'wallet_address',
        identity.wallet.toLowerCase(),
      );
    } else {
      throw new Error(
        'No session identity is available.',
      );
    }

    const { data, error } = await query
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : 'Unable to update profile.';

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: authStatus(message),
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
