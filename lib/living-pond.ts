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
  | 'golden-butterfly'
  | 'bubble-trail'
  | 'reed-rustle'
  | 'lily-turn'
  | 'floating-feather'
  | 'snail-visit'
  | 'duck-family'
  | 'frog-call'
  | 'firefly-rest'
  | 'bottle-glint'
  | 'heron-shadow'
  | 'fog-lantern'
  | 'tadpole-ring'
  | 'acorn-drop'
  | 'goose-crossing'
  | 'moon-lotus'
  | 'pond-whisper';

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
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  weather: 'clear' | 'drizzle' | 'rain' | 'fog' | 'wind' | 'snow';
  mood: 'bright' | 'quiet' | 'restless' | 'mysterious' | 'glowing';
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
    id: 'bubble-trail',
    durationMs: 4_800,
    weight: 13,
    frogCue: 'glance-left',
    allowed: ({ busy, snowing }) => !busy && !snowing,
  },
  {
    id: 'reed-rustle',
    durationMs: 4_600,
    weight: 12,
    frogCue: 'curious',
    allowed: ({ busy }) => !busy,
  },
  {
    id: 'lily-turn',
    durationMs: 5_500,
    weight: 10,
    frogCue: 'blink',
    allowed: ({ busy, snowing }) => !busy && !snowing,
  },
  {
    id: 'floating-feather',
    durationMs: 8_200,
    weight: 7,
    frogCue: 'look-up',
    allowed: ({ busy, raining, snowing }) => !busy && !raining && !snowing,
  },
  {
    id: 'snail-visit',
    durationMs: 10_500,
    weight: 6,
    frogCue: 'glance-right',
    allowed: ({ busy, raining, snowing }) => !busy && raining && !snowing,
  },
  {
    id: 'duck-family',
    durationMs: 9_500,
    weight: 4,
    frogCue: 'smile',
    allowed: ({ busy, raining, snowing, hour }) =>
      !busy && !raining && !snowing && hour >= 7 && hour < 19,
  },
  {
    id: 'frog-call',
    durationMs: 5_200,
    weight: 8,
    frogCue: 'curious',
    allowed: ({ busy, snowing, hour }) => !busy && !snowing && (hour >= 17 || hour < 8),
  },
  {
    id: 'firefly-rest',
    durationMs: 6_800,
    weight: 7,
    frogCue: 'glance-right',
    allowed: ({ busy, fireflies, hour }) => !busy && fireflies && nightHours(hour),
  },
  {
    id: 'bottle-glint',
    durationMs: 7_600,
    weight: 3,
    frogCue: 'curious',
    allowed: ({ busy, snowing }) => !busy && !snowing,
  },
  {
    id: 'heron-shadow',
    durationMs: 5_800,
    weight: 2,
    frogCue: 'look-up',
    allowed: ({ busy, raining, snowing, hour }) =>
      !busy && !raining && !snowing && hour >= 6 && hour < 18,
  },

  {
    id: 'fog-lantern',
    durationMs: 9_500,
    weight: 3,
    frogCue: 'curious',
    allowed: ({ busy, weather }) => !busy && weather === 'fog',
  },
  {
    id: 'tadpole-ring',
    durationMs: 5_800,
    weight: 7,
    frogCue: 'glance-left',
    allowed: ({ busy, snowing, season }) => !busy && !snowing && season === 'spring',
  },
  {
    id: 'acorn-drop',
    durationMs: 5_000,
    weight: 7,
    frogCue: 'look-up',
    allowed: ({ busy, raining, season }) => !busy && !raining && season === 'autumn',
  },
  {
    id: 'goose-crossing',
    durationMs: 8_200,
    weight: 3,
    frogCue: 'look-up',
    allowed: ({ busy, raining, hour, season }) =>
      !busy && !raining && season === 'autumn' && hour >= 7 && hour < 18,
  },
  {
    id: 'moon-lotus',
    durationMs: 8_800,
    weight: 2,
    frogCue: 'look-up',
    allowed: ({ busy, raining, moonPhase, hour }) =>
      !busy && !raining && moonPhase === 'full' && nightHours(hour),
  },
  {
    id: 'pond-whisper',
    durationMs: 6_800,
    weight: 2,
    frogCue: 'double-blink',
    allowed: ({ busy, mood }) => !busy && (mood === 'mysterious' || mood === 'quiet'),
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
