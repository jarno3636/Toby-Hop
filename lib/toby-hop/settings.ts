import 'server-only';

import { supabaseAdmin } from '@/lib/supabase/admin';

type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

export type TobyHopSettingRow = {
  key: string;
  value: JsonValue;
  description: string | null;
  updated_at: string;
};

export type ToggleSetting = {
  enabled: boolean;
};

export type ChanceSetting = {
  enabled: boolean;
  chance: number;
};

export type TobyHopSettings = {
  hop_cost: number;
  golden_toby: ChanceSetting;
  rainbow_pond: ChanceSetting;
  weather: ToggleSetting;
  leaderboard: ToggleSetting;
  maintenance: ToggleSetting;
};

export const DEFAULT_TOBY_HOP_SETTINGS: TobyHopSettings = {
  hop_cost: 0.01,

  golden_toby: {
    enabled: true,
    chance: 0.001,
  },

  rainbow_pond: {
    enabled: true,
    chance: 0.01,
  },

  weather: {
    enabled: true,
  },

  leaderboard: {
    enabled: true,
  },

  maintenance: {
    enabled: false,
  },
};

const SETTINGS_CACHE_DURATION_MS = 60_000;

let settingsCache:
  | {
      value: TobyHopSettings;
      expiresAt: number;
    }
  | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseBoolean(
  value: unknown,
  fallback: boolean,
): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseNumber(
  value: unknown,
  fallback: number,
  options?: {
    min?: number;
    max?: number;
  },
): number {
  let parsed: number | null = null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    parsed = value;
  }

  if (
    typeof value === 'string' &&
    value.trim().length > 0
  ) {
    const converted = Number(value);

    if (Number.isFinite(converted)) {
      parsed = converted;
    }
  }

  if (parsed === null) {
    return fallback;
  }

  if (
    options?.min !== undefined &&
    parsed < options.min
  ) {
    return fallback;
  }

  if (
    options?.max !== undefined &&
    parsed > options.max
  ) {
    return fallback;
  }

  return parsed;
}

function parseToggleSetting(
  value: unknown,
  fallback: ToggleSetting,
): ToggleSetting {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    enabled: parseBoolean(
      value.enabled,
      fallback.enabled,
    ),
  };
}

function parseChanceSetting(
  value: unknown,
  fallback: ChanceSetting,
): ChanceSetting {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    enabled: parseBoolean(
      value.enabled,
      fallback.enabled,
    ),

    chance: parseNumber(
      value.chance,
      fallback.chance,
      {
        min: 0,
        max: 1,
      },
    ),
  };
}

function normalizeSettings(
  rows: TobyHopSettingRow[],
): TobyHopSettings {
  const values = new Map<string, JsonValue>();

  for (const row of rows) {
    values.set(row.key, row.value);
  }

  return {
    hop_cost: parseNumber(
      values.get('hop_cost'),
      DEFAULT_TOBY_HOP_SETTINGS.hop_cost,
      {
        min: 0,
      },
    ),

    golden_toby: parseChanceSetting(
      values.get('golden_toby'),
      DEFAULT_TOBY_HOP_SETTINGS.golden_toby,
    ),

    rainbow_pond: parseChanceSetting(
      values.get('rainbow_pond'),
      DEFAULT_TOBY_HOP_SETTINGS.rainbow_pond,
    ),

    weather: parseToggleSetting(
      values.get('weather'),
      DEFAULT_TOBY_HOP_SETTINGS.weather,
    ),

    leaderboard: parseToggleSetting(
      values.get('leaderboard'),
      DEFAULT_TOBY_HOP_SETTINGS.leaderboard,
    ),

    maintenance: parseToggleSetting(
      values.get('maintenance'),
      DEFAULT_TOBY_HOP_SETTINGS.maintenance,
    ),
  };
}

export async function getTobyHopSettings(
  options?: {
    bypassCache?: boolean;
  },
): Promise<TobyHopSettings> {
  const now = Date.now();

  if (
    !options?.bypassCache &&
    settingsCache &&
    settingsCache.expiresAt > now
  ) {
    return settingsCache.value;
  }

  const { data, error } = await supabaseAdmin
    .from('toby_hop_settings')
    .select('key, value, description, updated_at');

  if (error) {
    console.error(
      '[toby-hop-settings] Failed to load settings:',
      error,
    );

    return settingsCache?.value ??
      DEFAULT_TOBY_HOP_SETTINGS;
  }

  const settings = normalizeSettings(
    (data ?? []) as TobyHopSettingRow[],
  );

  settingsCache = {
    value: settings,
    expiresAt:
      now + SETTINGS_CACHE_DURATION_MS,
  };

  return settings;
}

export async function getTobyHopSetting<
  Key extends keyof TobyHopSettings,
>(
  key: Key,
  options?: {
    bypassCache?: boolean;
  },
): Promise<TobyHopSettings[Key]> {
  const settings = await getTobyHopSettings(options);

  return settings[key];
}

export function clearTobyHopSettingsCache(): void {
  settingsCache = undefined;
}
