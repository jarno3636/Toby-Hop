import {
  randomInt,
} from 'node:crypto';

import {
  supabaseAdmin,
} from '@/lib/supabase/admin';

import type {
  PondEncounterConditions,
  PondEncounterDefinitionRow,
  PondEncounterResult,
  PondEncounterRow,
  PondTimeOfDay,
  ProcessPondEncounterInput,
} from './types';

const RANDOM_SCALE =
  1_000_000_000;

function getSecureRoll(): number {
  return (
    randomInt(
      0,
      RANDOM_SCALE,
    ) /
    RANDOM_SCALE
  );
}

function getTimeOfDay(
  date: Date,
): PondTimeOfDay {
  const hour =
    date.getUTCHours();

  if (
    hour >= 5 &&
    hour < 12
  ) {
    return 'morning';
  }

  if (
    hour >= 12 &&
    hour < 17
  ) {
    return 'afternoon';
  }

  if (
    hour >= 17 &&
    hour < 21
  ) {
    return 'evening';
  }

  return 'night';
}

function numberFromUnknown(
  value: unknown,
): number | null {
  if (
    typeof value ===
      'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value ===
    'string'
  ) {
    const parsed =
      Number(value);

    if (
      Number.isFinite(parsed)
    ) {
      return parsed;
    }
  }

  return null;
}

function normalizeConditions(
  value:
    | PondEncounterConditions
    | null
    | undefined,
): PondEncounterConditions {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return {};
  }

  return value;
}

function definitionMatchesConditions(
  definition: PondEncounterDefinitionRow,
  input: ProcessPondEncounterInput,
  occurredAt: Date,
): boolean {
  const conditions =
    normalizeConditions(
      definition.conditions,
    );

  const currentTimeOfDay =
    getTimeOfDay(
      occurredAt,
    );

  if (
    Array.isArray(
      conditions.timeOfDay,
    ) &&
    conditions.timeOfDay.length >
      0 &&
    !conditions.timeOfDay.includes(
      currentTimeOfDay,
    )
  ) {
    return false;
  }

  if (
    typeof conditions.minimumStreak ===
      'number' &&
    input.streak <
      conditions.minimumStreak
  ) {
    return false;
  }

  if (
    typeof conditions.maximumStreak ===
      'number' &&
    input.streak >
      conditions.maximumStreak
  ) {
    return false;
  }

  if (
    typeof conditions.minimumTotalHops ===
      'number' &&
    input.totalHops <
      conditions.minimumTotalHops
  ) {
    return false;
  }

  if (
    typeof conditions.maximumTotalHops ===
      'number' &&
    input.totalHops >
      conditions.maximumTotalHops
  ) {
    return false;
  }

  if (
    Array.isArray(
      conditions.daysOfWeek,
    ) &&
    conditions.daysOfWeek.length >
      0 &&
    !conditions.daysOfWeek.includes(
      occurredAt.getUTCDay(),
    )
  ) {
    return false;
  }

  return true;
}

function definitionIsActive(
  definition: PondEncounterDefinitionRow,
  occurredAt: Date,
): boolean {
  if (
    !definition.enabled
  ) {
    return false;
  }

  if (
    definition.starts_at
  ) {
    const startsAt =
      new Date(
        definition.starts_at,
      );

    if (
      Number.isNaN(
        startsAt.getTime(),
      ) ||
      occurredAt <
        startsAt
    ) {
      return false;
    }
  }

  if (
    definition.ends_at
  ) {
    const endsAt =
      new Date(
        definition.ends_at,
      );

    if (
      Number.isNaN(
        endsAt.getTime(),
      ) ||
      occurredAt >
        endsAt
    ) {
      return false;
    }
  }

  return true;
}

function encounterRowToResult(
  row: PondEncounterRow,
): PondEncounterResult {
  return {
    id:
      row.id,

    key:
      row.encounter_key,

    name:
      row.name,

    description:
      row.description,

    category:
      row.category,

    rarity:
      row.rarity,

    visualKey:
      row.visual_key,

    rewardXp:
      row.reward_xp,

    firstDiscovery:
      row.first_discovery,

    createdAt:
      row.created_at,
  };
}

async function getExistingEncounter(
  hopId: string,
): Promise<PondEncounterRow | null> {
  const db =
    supabaseAdmin();

  const {
    data,
    error,
  } =
    await db
      .from(
        'toby_hop_encounters',
      )
      .select(`
        id,
        fid,
        hop_id,
        encounter_definition_id,
        encounter_key,
        name,
        description,
        category,
        rarity,
        visual_key,
        reward_xp,
        first_discovery,
        roll_value,
        metadata,
        created_at
      `)
      .eq(
        'hop_id',
        hopId,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to check existing pond encounter: ${error.message}`,
    );
  }

  return (
    data as
      | PondEncounterRow
      | null
  );
}

async function getActiveDefinitions(
  occurredAt: Date,
): Promise<
  PondEncounterDefinitionRow[]
> {
  const db =
    supabaseAdmin();

  const nowIso =
    occurredAt.toISOString();

  const {
    data,
    error,
  } =
    await db
      .from(
        'toby_hop_encounter_definitions',
      )
      .select(`
        id,
        encounter_key,
        name,
        description,
        category,
        rarity,
        probability,
        enabled,
        visual_key,
        reward_xp,
        repeatable,
        starts_at,
        ends_at,
        conditions,
        metadata
      `)
      .eq(
        'enabled',
        true,
      )
      .or(
        `starts_at.is.null,starts_at.lte.${nowIso}`,
      )
      .or(
        `ends_at.is.null,ends_at.gte.${nowIso}`,
      )
      .order(
        'probability',
        {
          ascending:
            false,
        },
      );

  if (error) {
    throw new Error(
      `Unable to load pond encounters: ${error.message}`,
    );
  }

  return (
    data ??
    []
  ) as PondEncounterDefinitionRow[];
}

async function userAlreadyFound(
  fid: number,
  encounterKey: string,
): Promise<boolean> {
  const db =
    supabaseAdmin();

  const {
    data,
    error,
  } =
    await db
      .from(
        'toby_hop_user_finds',
      )
      .select(
        'encounter_key',
      )
      .eq(
        'fid',
        fid,
      )
      .eq(
        'encounter_key',
        encounterKey,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to check pond discovery: ${error.message}`,
    );
  }

  return Boolean(data);
}

async function selectEncounter(
  definitions:
    PondEncounterDefinitionRow[],
  input:
    ProcessPondEncounterInput,
  occurredAt:
    Date,
): Promise<{
  definition:
    PondEncounterDefinitionRow;
  rollValue:
    number;
} | null> {
  const eligibleDefinitions:
    PondEncounterDefinitionRow[] =
      [];

  for (
    const definition of
    definitions
  ) {
    if (
      !definitionIsActive(
        definition,
        occurredAt,
      )
    ) {
      continue;
    }

    if (
      !definitionMatchesConditions(
        definition,
        input,
        occurredAt,
      )
    ) {
      continue;
    }

    if (
      !definition.repeatable
    ) {
      const alreadyFound =
        await userAlreadyFound(
          input.fid,
          definition.encounter_key,
        );

      if (
        alreadyFound
      ) {
        continue;
      }
    }

    eligibleDefinitions.push(
      definition,
    );
  }

  const rollValue =
    getSecureRoll();

  let cumulativeProbability =
    0;

  for (
    const definition of
    eligibleDefinitions
  ) {
    const probability =
      numberFromUnknown(
        definition.probability,
      );

    if (
      probability ===
        null ||
      probability <=
        0
    ) {
      continue;
    }

    cumulativeProbability +=
      probability;

    if (
      rollValue <
      cumulativeProbability
    ) {
      return {
        definition,
        rollValue,
      };
    }
  }

  return null;
}

async function upsertUserFind(
  input:
    ProcessPondEncounterInput,
  definition:
    PondEncounterDefinitionRow,
  occurredAt:
    Date,
): Promise<boolean> {
  const db =
    supabaseAdmin();

  const existing =
    await userAlreadyFound(
      input.fid,
      definition.encounter_key,
    );

  if (
    !existing
  ) {
    const {
      error,
    } =
      await db
        .from(
          'toby_hop_user_finds',
        )
        .insert({
          fid:
            input.fid,

          encounter_key:
            definition.encounter_key,

          encounter_definition_id:
            definition.id,

          name:
            definition.name,

          description:
            definition.description,

          rarity:
            definition.rarity,

          visual_key:
            definition.visual_key,

          times_found:
            1,

          first_hop_id:
            input.hopId,

          latest_hop_id:
            input.hopId,

          first_found_at:
            occurredAt.toISOString(),

          last_found_at:
            occurredAt.toISOString(),

          metadata:
            definition.metadata ??
            {},
        });

    if (
      !error
    ) {
      return true;
    }

    if (
      error.code !==
      '23505'
    ) {
      throw new Error(
        `Unable to store first pond discovery: ${error.message}`,
      );
    }
  }

  const {
    data:
      currentFind,
    error:
      loadError,
  } =
    await db
      .from(
        'toby_hop_user_finds',
      )
      .select(
        'times_found',
      )
      .eq(
        'fid',
        input.fid,
      )
      .eq(
        'encounter_key',
        definition.encounter_key,
      )
      .single();

  if (
    loadError
  ) {
    throw new Error(
      `Unable to load pond discovery count: ${loadError.message}`,
    );
  }

  const currentCount =
    typeof currentFind
      ?.times_found ===
      'number'
      ? currentFind
          .times_found
      : 1;

  const {
    error:
      updateError,
  } =
    await db
      .from(
        'toby_hop_user_finds',
      )
      .update({
        times_found:
          currentCount +
          1,

        latest_hop_id:
          input.hopId,

        last_found_at:
          occurredAt.toISOString(),
      })
      .eq(
        'fid',
        input.fid,
      )
      .eq(
        'encounter_key',
        definition.encounter_key,
      );

  if (
    updateError
  ) {
    throw new Error(
      `Unable to update pond discovery: ${updateError.message}`,
    );
  }

  return false;
}

export async function processHopEncounter(
  input: ProcessPondEncounterInput,
): Promise<PondEncounterResult | null> {
  const occurredAt =
    input.occurredAt ??
    new Date();

  const existingEncounter =
    await getExistingEncounter(
      input.hopId,
    );

  if (
    existingEncounter
  ) {
    return encounterRowToResult(
      existingEncounter,
    );
  }

  const definitions =
    await getActiveDefinitions(
      occurredAt,
    );

  const selected =
    await selectEncounter(
      definitions,
      input,
      occurredAt,
    );

  if (
    !selected
  ) {
    return null;
  }

  const {
    definition,
    rollValue,
  } =
    selected;

  const firstDiscovery =
    await upsertUserFind(
      input,
      definition,
      occurredAt,
    );

  const db =
    supabaseAdmin();

  const {
    data,
    error,
  } =
    await db
      .from(
        'toby_hop_encounters',
      )
      .insert({
        fid:
          input.fid,

        hop_id:
          input.hopId,

        encounter_definition_id:
          definition.id,

        encounter_key:
          definition.encounter_key,

        name:
          definition.name,

        description:
          definition.description,

        category:
          definition.category,

        rarity:
          definition.rarity,

        visual_key:
          definition.visual_key,

        reward_xp:
          definition.reward_xp,

        first_discovery:
          firstDiscovery,

        roll_value:
          rollValue,

        metadata: {
          ...(definition.metadata ??
            {}),

          streak:
            input.streak,

          totalHops:
            input.totalHops,

          timeOfDay:
            getTimeOfDay(
              occurredAt,
            ),
        },
      })
      .select(`
        id,
        fid,
        hop_id,
        encounter_definition_id,
        encounter_key,
        name,
        description,
        category,
        rarity,
        visual_key,
        reward_xp,
        first_discovery,
        roll_value,
        metadata,
        created_at
      `)
      .single();

  if (
    error
  ) {
    if (
      error.code ===
      '23505'
    ) {
      const recovered =
        await getExistingEncounter(
          input.hopId,
        );

      return recovered
        ? encounterRowToResult(
            recovered,
          )
        : null;
    }

    throw new Error(
      `Unable to record pond encounter: ${error.message}`,
    );
  }

  return encounterRowToResult(
    data as PondEncounterRow,
  );
}
