import type { LivingPondContext } from '@/lib/living-pond';

export type PondWonderId =
  | 'counter-ripple'
  | 'twin-splash'
  | 'giant-firefly'
  | 'second-moon'
  | 'leaf-crown'
  | 'listening-reeds'
  | 'silver-thread'
  | 'still-water';

export type PondWonder = {
  id: PondWonderId;
  durationMs: number;
  ariaLabel: string;
  allowed: (context: LivingPondContext) => boolean;
};

const isNight = (hour: number) => hour >= 19 || hour < 6;

const WONDERS: readonly PondWonder[] = [
  {
    id: 'counter-ripple',
    durationMs: 7_000,
    ariaLabel: 'A ripple moves against the current.',
    allowed: ({ snowing, busy }) => !snowing && !busy,
  },
  {
    id: 'twin-splash',
    durationMs: 5_400,
    ariaLabel: 'Two fish break the surface in perfect time.',
    allowed: ({ snowing, busy }) => !snowing && !busy,
  },
  {
    id: 'giant-firefly',
    durationMs: 8_200,
    ariaLabel: 'One firefly glows brighter than all the others.',
    allowed: ({ fireflies, raining, hour, busy }) => fireflies && !raining && isNight(hour) && !busy,
  },
  {
    id: 'second-moon',
    durationMs: 6_800,
    ariaLabel: 'A second moon appears briefly in the water.',
    allowed: ({ moonPhase, raining, snowing, hour, busy }) =>
      moonPhase === 'full' && !raining && !snowing && isNight(hour) && !busy,
  },
  {
    id: 'leaf-crown',
    durationMs: 7_600,
    ariaLabel: 'A leaf settles like a tiny crown.',
    allowed: ({ autumn, weather, busy }) => autumn && weather !== 'rain' && !busy,
  },
  {
    id: 'listening-reeds',
    durationMs: 6_600,
    ariaLabel: 'The reeds lean toward the pond as though listening.',
    allowed: ({ weather, busy }) => (weather === 'wind' || weather === 'fog') && !busy,
  },
  {
    id: 'silver-thread',
    durationMs: 7_200,
    ariaLabel: 'A silver line travels across the water.',
    allowed: ({ raining, snowing, busy }) => !raining && !snowing && !busy,
  },
  {
    id: 'still-water',
    durationMs: 6_400,
    ariaLabel: 'For a moment, the whole pond becomes perfectly still.',
    allowed: ({ weather, mood, busy }) => weather === 'clear' && mood === 'quiet' && !busy,
  },
] as const;

function hash(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function chooseDailyWonder(
  context: LivingPondContext,
  dayKey = new Date().toISOString().slice(0, 10),
): PondWonder | null {
  const candidates = WONDERS.filter((wonder) => wonder.allowed(context));
  if (candidates.length === 0) return null;

  const seed = [
    dayKey,
    context.themeId,
    context.weather,
    context.season,
    context.moonPhase,
    context.macroEventKey ?? 'none',
  ].join('|');

  return candidates[hash(seed) % candidates.length] ?? null;
}
