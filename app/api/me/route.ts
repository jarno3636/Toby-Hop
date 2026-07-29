import { NextResponse } from 'next/server';

import { requireCanonicalIdentity } from '@/lib/auth/canonical-identity';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTodaysPond, getUtcDayKey } from '@/lib/todays-pond';
import type {
  PondFind,
  PondJournal,
  PondJournalEntry,
  PondSecret,
  PondCommunityDiscovery,
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

type SecretRow = {
  secret_key: string;
  secret_name: string;
  description: string;
  source: string;
  unlocked_at: string;
};

type NotificationUserRow = {
  notifications_enabled: boolean | null;
  notification_url: string | null;
  notification_token: string | null;
};

type CommunityEncounterRow = {
  encounter_key: string;
  name: string;
  rarity: PondJournalEntry['rarity'];
  visual_key: string;
  fid: number;
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
        recentSecrets: [],
        conditions: null,
        communityDiscoveries: [],
        notificationHealth: { enabled: false, credentialsStored: false, status: 'unknown' },
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
      secretsResult,
      notificationUserResult,
      communityResult,
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

      db
        .from('toby_hop_user_secrets')
        .select('secret_key,secret_name,description,source,unlocked_at')
        .eq('fid', identity.fid)
        .order('unlocked_at', { ascending: false })
        .limit(12),

      db
        .from('toby_hop_users')
        .select('notifications_enabled,notification_url,notification_token')
        .eq('fid', identity.fid)
        .maybeSingle<NotificationUserRow>(),

      db
        .from('toby_hop_encounters')
        .select('encounter_key,name,rarity,visual_key,fid')
        .gte('created_at', `${getUtcDayKey()}T00:00:00.000Z`)
        .order('created_at', { ascending: false })
        .limit(1000),
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

    if (secretsResult.error && secretsResult.error.code !== '42P01') {
      throw new Error(
        `Unable to load pond secrets: ${secretsResult.error.message}`,
      );
    }

    if (notificationUserResult.error) {
      throw new Error(`Unable to load notification status: ${notificationUserResult.error.message}`);
    }

    if (communityResult.error) {
      throw new Error(`Unable to load community discoveries: ${communityResult.error.message}`);
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

    const recentSecrets: PondSecret[] =
      ((secretsResult.data ?? []) as SecretRow[]).map((row) => ({
        key: row.secret_key,
        name: row.secret_name,
        description: row.description,
        source: row.source,
        unlockedAt: row.unlocked_at,
      }));

    const rareDiscoveries = findRows.filter(
      (row) =>
        row.rarity === 'rare' ||
        row.rarity === 'legendary',
    ).length;

    const encounterSecretDiscoveries = findRows.filter(
      (row) => row.rarity === 'secret',
    ).length;

    const secretDiscoveries =
      encounterSecretDiscoveries + recentSecrets.length;

    const totalDiscoveryXp = (xpResult.data ?? []).reduce(
      (total, row) =>
        total + numberFromUnknown(row.reward_xp),
      0,
    );

    const pond = getTodaysPond();
    const communityRows = (communityResult.data ?? []) as CommunityEncounterRow[];
    const communityMap = new Map<string, { name: string; rarity: PondJournalEntry['rarity']; visualKey: string; fids: Set<number> }>();

    for (const row of communityRows) {
      const current = communityMap.get(row.encounter_key) ?? {
        name: row.name,
        rarity: row.rarity,
        visualKey: row.visual_key,
        fids: new Set<number>(),
      };
      current.fids.add(row.fid);
      communityMap.set(row.encounter_key, current);
    }

    const communityDiscoveries: PondCommunityDiscovery[] = [...communityMap.entries()]
      .map(([key, value]) => ({
        key,
        name: value.name,
        rarity: value.rarity,
        visualKey: value.visualKey,
        travelers: value.fids.size,
      }))
      .sort((a, b) => b.travelers - a.travelers)
      .slice(0, 5);

    const notificationRow = notificationUserResult.data;
    const credentialsStored = Boolean(notificationRow?.notification_url && notificationRow?.notification_token);
    const notificationsEnabled = notificationRow?.notifications_enabled === true;

    const journal: PondJournal = {
      availableDiscoveries:
        definitionsResult.count ?? 0,
      uniqueDiscoveries: findRows.length,
      rareDiscoveries,
      secretDiscoveries,
      totalDiscoveryXp,
      recentFinds,
      recentEntries,
      recentSecrets,
      conditions: {
        name: pond.name,
        emoji: pond.emoji,
        description: pond.description,
        weather: pond.weather,
        season: pond.season,
        mood: pond.mood,
        moonPhase: pond.moonPhase,
        eventLabel: pond.eventLabel,
        dayKey: getUtcDayKey(),
        forecastName: pond.forecast.name,
        forecastEmoji: pond.forecast.emoji,
        forecastHint: pond.forecast.hint,
      },
      communityDiscoveries,
      notificationHealth: {
        enabled: notificationsEnabled,
        credentialsStored,
        status: notificationsEnabled && credentialsStored
          ? 'subscribed'
          : notificationsEnabled
            ? 'missing_credentials'
            : notificationRow
              ? 'disabled'
              : 'unknown',
      },
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
