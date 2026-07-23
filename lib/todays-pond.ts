export type PondThemeId =
  | 'moon'
  | 'rain'
  | 'fireflies'
  | 'blossom'
  | 'winter'
  | 'autumn'
  | 'lotus'
  | 'rainbow'
  | 'shooting-star';

export type PondParticle =
  | 'drop'
  | 'firefly'
  | 'petal'
  | 'snow'
  | 'leaf';

export type MoonPhase =
  | 'new'
  | 'waxing-crescent'
  | 'first-quarter'
  | 'waxing-gibbous'
  | 'full'
  | 'waning-gibbous'
  | 'last-quarter'
  | 'waning-crescent';

export type TodaysPond = {
  id: PondThemeId;
  name: string;
  emoji: string;
  description: string;
  moonPhase: MoonPhase;
  particle?: PondParticle;
  particleCount: number;
  goldenToby: boolean;
};

export const GOLDEN_TOBY_ODDS = 1000;
export const GOLDEN_TOBY_PERCENT = 100 / GOLDEN_TOBY_ODDS;

export const STARFALL_ODDS = 97;
export const STARFALL_PERCENT = 100 / STARFALL_ODDS;

const THEMES: Array<
  Omit<TodaysPond, 'goldenToby' | 'moonPhase'>
> = [
  {
    id: 'moon',
    name: 'Moonlit Pond',
    emoji: '🌙',
    description: 'Still water beneath the moon',
    particleCount: 0,
  },
  {
    id: 'rain',
    name: 'Rainy Pond',
    emoji: '🌧️',
    description: 'Soft rain ripples across the pond',
    particle: 'drop',
    particleCount: 18,
  },
  {
    id: 'fireflies',
    name: 'Firefly Pond',
    emoji: '✨',
    description: 'Tiny lights dance above the reeds',
    particle: 'firefly',
    particleCount: 13,
  },
  {
    id: 'blossom',
    name: 'Blossom Pond',
    emoji: '🌸',
    description: 'Cherry petals drift across the water',
    particle: 'petal',
    particleCount: 12,
  },
  {
    id: 'winter',
    name: 'Winter Pond',
    emoji: '❄️',
    description: 'A peaceful frost blankets the shoreline',
    particle: 'snow',
    particleCount: 16,
  },
  {
    id: 'autumn',
    name: 'Autumn Pond',
    emoji: '🍂',
    description: 'Golden leaves float quietly downstream',
    particle: 'leaf',
    particleCount: 12,
  },
  {
    id: 'lotus',
    name: 'Lotus Bloom',
    emoji: '🪷',
    description: 'Lotus flowers have opened this morning',
    particleCount: 0,
  },
  {
    id: 'rainbow',
    name: 'Rainbow Pond',
    emoji: '🌈',
    description: 'A rainbow stretches across the pond',
    particleCount: 0,
  },
  {
    id: 'shooting-star',
    name: 'Starfall Pond',
    emoji: '⭐',
    description: 'Keep your eyes on the night sky',
    particleCount: 0,
  },
];

const MOON_PHASES: readonly MoonPhase[] = [
  'new',
  'waxing-crescent',
  'first-quarter',
  'waxing-gibbous',
  'full',
  'waning-gibbous',
  'last-quarter',
  'waning-crescent',
];

function hashString(value: string): number {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function getUtcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getTodaysPond(
  date = new Date(),
): TodaysPond {
  const dayKey = getUtcDayKey(date);

  const pondSeed = hashString(`pond:${dayKey}`);
  const moonSeed = hashString(`moon:${dayKey}`);
  const goldenSeed = hashString(`golden:${dayKey}`);

  const starfallIndex = THEMES.length - 1;
  const normalThemeCount = THEMES.length - 1;

  const isStarfall =
    pondSeed % STARFALL_ODDS === 0;

  const themeIndex = isStarfall
    ? starfallIndex
    : pondSeed % normalThemeCount;

  return {
    ...THEMES[themeIndex],
    moonPhase:
      MOON_PHASES[
        moonSeed % MOON_PHASES.length
      ],
    goldenToby:
      goldenSeed % GOLDEN_TOBY_ODDS === 0,
  };
}
