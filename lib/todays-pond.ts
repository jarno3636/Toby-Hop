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

export type TodaysPond = {
  id: PondThemeId;
  name: string;
  emoji: string;
  description: string;
  moonPhase: string;
  particle?: PondParticle;
  particleCount: number;
  goldenToby: boolean;
};

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
    description: 'Soft rain is falling today',
    particle: 'drop',
    particleCount: 18,
  },
  {
    id: 'fireflies',
    name: 'Firefly Pond',
    emoji: '✨',
    description: 'The reeds are glowing tonight',
    particle: 'firefly',
    particleCount: 13,
  },
  {
    id: 'blossom',
    name: 'Blossom Pond',
    emoji: '🌸',
    description: 'Petals are drifting over the water',
    particle: 'petal',
    particleCount: 12,
  },
  {
    id: 'winter',
    name: 'Winter Pond',
    emoji: '❄️',
    description: 'A quiet frost has reached the pond',
    particle: 'snow',
    particleCount: 16,
  },
  {
    id: 'autumn',
    name: 'Autumn Pond',
    emoji: '🍂',
    description: 'Golden leaves are crossing the pond',
    particle: 'leaf',
    particleCount: 12,
  },
  {
    id: 'lotus',
    name: 'Lotus Bloom',
    emoji: '🪷',
    description: 'The lotus flowers opened today',
    particleCount: 0,
  },
  {
    id: 'rainbow',
    name: 'Rainbow Pond',
    emoji: '🌈',
    description: 'Color has appeared above the water',
    particleCount: 0,
  },
  {
    id: 'shooting-star',
    name: 'Starfall Pond',
    emoji: '⭐',
    description: 'Watch the sky closely today',
    particleCount: 0,
  },
];

const MOON_PHASES = [
  'new',
  'waxing-crescent',
  'first-quarter',
  'waxing-gibbous',
  'full',
  'waning-gibbous',
  'last-quarter',
  'waning-crescent',
] as const;

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
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
  const seed = hashString(`toby-hop:${dayKey}`);

  /*
    Starfall appears much less frequently than ordinary themes.
  */
  const normalThemeCount = THEMES.length - 1;

  const themeIndex =
    seed % 97 === 0
      ? THEMES.length - 1
      : seed % normalThemeCount;

  /*
    One globally shared Golden Toby date in approximately
    every 1000 UTC dates. It is visual only.
  */
  const goldenToby =
    hashString(`golden-toby:${dayKey}`) % 1000 === 0;

  const moonPhase =
    MOON_PHASES[
      hashString(`moon:${dayKey}`) %
        MOON_PHASES.length
    ];

  return {
    ...THEMES[themeIndex],
    goldenToby,
    moonPhase,
  };
}
