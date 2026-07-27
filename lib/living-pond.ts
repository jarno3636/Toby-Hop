export type LivingPondEventId =
  | 'butterfly'
  | 'dragonfly'
  | 'fish-jump'
  | 'turtle'
  | 'drifting-leaf'
  | 'owl'
  | 'water-sparkle'
  | 'pond-breath'
  | 'tiny-toby'
  | 'moon-gaze'
  | 'lotus-whisper'
  | 'golden-butterfly';

export type FrogCue =
  | 'idle'
  | 'blink'
  | 'double-blink'
  | 'glance-left'
  | 'glance-right'
  | 'look-up'
  | 'curious'
  | 'sleepy'
  | 'smile';

export type LivingPondContext = {
  themeId: string;
  moonPhase: string;
  raining: boolean;
  snowing: boolean;
  fireflies: boolean;
  autumn: boolean;
  lotus: boolean;
  golden: boolean;
  busy: boolean;
  todayHopped: boolean;
  streak: number;
  hour: number;
};

export type LivingPondEventDefinition = {
  id: LivingPondEventId;
  durationMs: number;
  weight: number;
  frogCue?: FrogCue;
  allowed: (context: LivingPondContext) => boolean;
};

const nightHours = (hour: number) => hour >= 19 || hour < 6;

export const LIVING_POND_EVENTS: readonly LivingPondEventDefinition[] = [
  {
    id: 'water-sparkle',
    durationMs: 4_200,
    weight: 22,
    allowed: ({ busy }) => !busy,
  },
  {
    id: 'pond-breath',
    durationMs: 8_500,
    weight: 10,
    frogCue: 'blink',
    allowed: ({ busy }) => !busy,
  },
  {
    id: 'fish-jump',
    durationMs: 2_800,
    weight: 13,
    frogCue: 'glance-left',
    allowed: ({ busy, snowing }) => !busy && !snowing,
  },
  {
    id: 'butterfly',
    durationMs: 7_200,
    weight: 10,
    frogCue: 'glance-right',
    allowed: ({ busy, raining, snowing, hour }) =>
      !busy && !raining && !snowing && !nightHours(hour),
  },
  {
    id: 'dragonfly',
    durationMs: 6_600,
    weight: 8,
    frogCue: 'curious',
    allowed: ({ busy, raining, snowing, hour }) =>
      !busy && !raining && !snowing && hour >= 7 && hour < 19,
  },
  {
    id: 'drifting-leaf',
    durationMs: 9_000,
    weight: 8,
    frogCue: 'glance-left',
    allowed: ({ busy, snowing }) => !busy && !snowing,
  },
  {
    id: 'turtle',
    durationMs: 12_000,
    weight: 5,
    frogCue: 'glance-right',
    allowed: ({ busy, snowing }) => !busy && !snowing,
  },
  {
    id: 'owl',
    durationMs: 7_500,
    weight: 4,
    frogCue: 'look-up',
    allowed: ({ busy, raining, snowing, hour }) =>
      !busy && !raining && !snowing && nightHours(hour),
  },
  {
    id: 'moon-gaze',
    durationMs: 9_000,
    weight: 4,
    frogCue: 'look-up',
    allowed: ({ busy, raining, snowing, hour }) =>
      !busy && !raining && !snowing && nightHours(hour),
  },
  {
    id: 'lotus-whisper',
    durationMs: 8_000,
    weight: 3,
    frogCue: 'curious',
    allowed: ({ busy, lotus, raining }) => !busy && lotus && !raining,
  },
  {
    id: 'tiny-toby',
    durationMs: 6_500,
    weight: 1,
    frogCue: 'double-blink',
    allowed: ({ busy, raining, snowing, streak }) =>
      !busy && !raining && !snowing && streak >= 3,
  },
  {
    id: 'golden-butterfly',
    durationMs: 8_000,
    weight: 2,
    frogCue: 'curious',
    allowed: ({ busy, golden, raining, snowing }) =>
      !busy && golden && !raining && !snowing,
  },
] as const;

export function chooseLivingPondEvent(
  context: LivingPondContext,
  recent: readonly LivingPondEventId[],
  random = Math.random,
): LivingPondEventDefinition | null {
  const candidates = LIVING_POND_EVENTS.filter(
    (event) => event.allowed(context) && !recent.includes(event.id),
  );

  if (candidates.length === 0) return null;

  const total = candidates.reduce((sum, event) => sum + event.weight, 0);
  let cursor = random() * total;

  for (const event of candidates) {
    cursor -= event.weight;
    if (cursor <= 0) return event;
  }

  return candidates[candidates.length - 1] ?? null;
}
