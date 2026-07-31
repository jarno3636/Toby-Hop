import { getSeasonalEvent, type SeasonalEventKey, type SeasonalVisualKind } from '@/lib/toby-core/events/seasonal-calendar';

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

export type PondParticle = 'drop' | 'firefly' | 'petal' | 'snow' | 'leaf';

export type MoonPhase =
  | 'new'
  | 'waxing-crescent'
  | 'first-quarter'
  | 'waxing-gibbous'
  | 'full'
  | 'waning-gibbous'
  | 'last-quarter'
  | 'waning-crescent';

export type PondSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type PondWeather = 'clear' | 'drizzle' | 'rain' | 'fog' | 'wind' | 'snow';
export type PondMood = 'bright' | 'quiet' | 'restless' | 'mysterious' | 'glowing';

export type PondEventKind = 'moonlight' | 'rainfall' | 'firefly-bloom' | 'blossom-drift' | 'winter-stillness' | 'autumn-drift' | 'lotus-bloom' | 'rainbow' | 'starfall';

export type PondForecast = {
  dayKey: string;
  weather: PondWeather;
  season: PondSeason;
  name: string;
  emoji: string;
  hint: string;
};

export type TodaysPond = {
  id: PondThemeId;
  name: string;
  emoji: string;
  description: string;
  moonPhase: MoonPhase;
  particle?: PondParticle;
  particleCount: number;
  goldenToby: boolean;
  season: PondSeason;
  weather: PondWeather;
  mood: PondMood;
  curiosityTitle: string;
  curiosityBody: string;
  forecast: PondForecast;
  eventKind: PondEventKind;
  eventLabel: string;
  weatherLabel: string;
  weatherEmoji: string;
  macroEvent: null | {
    key: SeasonalEventKey;
    name: string;
    emoji: string;
    description: string;
    visualKind: SeasonalVisualKind;
  };
  combinationLabel: string;
  storyTitle: string;
  dailyNarrative: string;
  interactionHint: string;
  visitStatus: string;
};

export const GOLDEN_TOBY_ODDS = 1000;
export const GOLDEN_TOBY_PERCENT = 100 / GOLDEN_TOBY_ODDS;
export const STARFALL_ODDS = 97;
export const STARFALL_PERCENT = 100 / STARFALL_ODDS;

const THEMES: Array<Omit<TodaysPond, 'goldenToby' | 'moonPhase' | 'season' | 'weather' | 'mood' | 'curiosityTitle' | 'curiosityBody' | 'forecast' | 'eventKind' | 'eventLabel' | 'weatherLabel' | 'weatherEmoji' | 'macroEvent' | 'combinationLabel' | 'storyTitle' | 'dailyNarrative' | 'interactionHint' | 'visitStatus'>> = [
  { id: 'moon', name: 'Moonlit Pond', emoji: '🌙', description: 'Still water beneath the moon', particleCount: 0 },
  { id: 'rain', name: 'Rainy Pond', emoji: '🌧️', description: 'Soft rain ripples across the pond', particle: 'drop', particleCount: 18 },
  { id: 'fireflies', name: 'Firefly Pond', emoji: '✨', description: 'Tiny lights dance above the reeds', particle: 'firefly', particleCount: 13 },
  { id: 'blossom', name: 'Blossom Pond', emoji: '🌸', description: 'Cherry petals drift across the water', particle: 'petal', particleCount: 12 },
  { id: 'winter', name: 'Winter Pond', emoji: '❄️', description: 'A peaceful frost blankets the shoreline', particle: 'snow', particleCount: 16 },
  { id: 'autumn', name: 'Autumn Pond', emoji: '🍂', description: 'Golden leaves float quietly downstream', particle: 'leaf', particleCount: 12 },
  { id: 'lotus', name: 'Lotus Bloom', emoji: '🪷', description: 'Lotus flowers have opened this morning', particleCount: 0 },
  { id: 'rainbow', name: 'Rainbow Pond', emoji: '🌈', description: 'A rainbow stretches across the pond', particleCount: 0 },
  { id: 'shooting-star', name: 'Starfall Pond', emoji: '⭐', description: 'Keep your eyes on the night sky', particleCount: 0 },
];


const EVENT_DETAILS: Record<PondThemeId, { kind: PondEventKind; label: string }> = {
  moon: { kind: 'moonlight', label: 'Moonlight' },
  rain: { kind: 'rainfall', label: 'Rainfall' },
  fireflies: { kind: 'firefly-bloom', label: 'Firefly Bloom' },
  blossom: { kind: 'blossom-drift', label: 'Blossom Drift' },
  winter: { kind: 'winter-stillness', label: 'Winter Stillness' },
  autumn: { kind: 'autumn-drift', label: 'Autumn Drift' },
  lotus: { kind: 'lotus-bloom', label: 'Lotus Bloom' },
  rainbow: { kind: 'rainbow', label: 'Rainbow' },
  'shooting-star': { kind: 'starfall', label: 'Starfall' },
};

const WEATHER_DETAILS: Record<PondWeather, { label: string; emoji: string }> = {
  clear: { label: 'Clear', emoji: '☀️' },
  drizzle: { label: 'Drizzle', emoji: '🌦️' },
  rain: { label: 'Rain', emoji: '🌧️' },
  fog: { label: 'Fog', emoji: '🌫️' },
  wind: { label: 'Wind', emoji: '🍃' },
  snow: { label: 'Snow', emoji: '❄️' },
};

const MOON_PHASES: readonly MoonPhase[] = [
  'new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous',
  'full', 'waning-gibbous', 'last-quarter', 'waning-crescent',
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

export function getPondSeason(date = new Date()): PondSeason {
  const month = date.getUTCMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

function weatherFromRoll(roll: number, season: PondSeason): PondWeather {
  if (season === 'winter' && roll < 15) return 'snow';
  if (roll < 15) return 'fog';
  if (roll < 28) return 'drizzle';
  if (roll < 39) return 'rain';
  if (roll < 54) return 'wind';
  return 'clear';
}

function getWeather(dayKey: string, season: PondSeason): PondWeather {
  const candidate = weatherFromRoll(hashString(`weather:${dayKey}`) % 100, season);
  const previousDayKey = shiftDayKey(dayKey, -1);
  const previousSeason = getPondSeason(dateFromDayKey(previousDayKey));
  const previous = weatherFromRoll(hashString(`weather:${previousDayKey}`) % 100, previousSeason);

  if (candidate !== previous) return candidate;

  // Keep the weather deterministic while preventing obvious back-to-back loops.
  const reroll = hashString(`weather-reroll:${dayKey}`) % 100;
  const alternatives: PondWeather[] = season === 'winter'
    ? ['clear', 'wind', 'fog', 'drizzle', 'snow', 'rain']
    : ['clear', 'wind', 'fog', 'drizzle', 'rain'];

  const rerolled = alternatives[reroll % alternatives.length];
  return rerolled === previous
    ? alternatives[(reroll + 1) % alternatives.length]
    : rerolled;
}

function getMood(theme: PondThemeId, weather: PondWeather): PondMood {
  if (theme === 'rainbow' || theme === 'fireflies') return 'glowing';
  if (theme === 'shooting-star' || weather === 'fog') return 'mysterious';
  if (weather === 'wind' || weather === 'rain') return 'restless';
  if (weather === 'drizzle' || weather === 'snow' || theme === 'moon') return 'quiet';
  return 'bright';
}

function getCuriosityCopy(theme: PondThemeId, weather: PondWeather, moonPhase: MoonPhase) {
  if (theme === 'rainbow') return { title: 'Colors reached the pond 🌈', body: 'The water looks different today. Some visitors only appear beneath a rainbow.' };
  if (theme === 'shooting-star') return { title: 'Starfall over the pond ✦', body: 'Keep an eye on the sky. Rare things sometimes surface after dark.' };
  if (weather === 'fog') return { title: 'Fog settled over the pond', body: 'The shoreline is unusually quiet. Something may be moving beyond the reeds.' };
  if (weather === 'rain') return { title: 'Heavy rain at the pond 🌧️', body: 'Frog calls are carrying across the water and rainy-day visitors are stirring.' };
  if (weather === 'drizzle') return { title: 'A soft rain has begun', body: 'Small ripples are spreading. This is when the patient visitors come out.' };
  if (weather === 'wind') return { title: 'The reeds are restless today', body: 'Wind is moving across the pond. Watch for feathers and passing shadows.' };
  if (weather === 'snow') return { title: 'The pond woke under snow ❄️', body: 'Everything is still. Winter visitors leave only the smallest signs.' };
  if (moonPhase === 'full') return { title: 'A full moon rises tonight 🌕', body: 'The water will glow after dark. The owl may be watching.' };
  return { title: 'The pond feels alive today', body: 'A small visitor may appear if you stay for a moment.' };
}

function buildForecast(date: Date): PondForecast {
  const tomorrow = new Date(date.getTime() + 86_400_000);
  const tomorrowPond = buildDailyPond(tomorrow, false);
  const copy: Record<PondWeather, { name: string; emoji: string; hint: string }> = {
    clear: { name: 'Clear water', emoji: '☀️', hint: 'Dragonflies and butterflies may be active.' },
    drizzle: { name: 'Light drizzle', emoji: '🌦️', hint: 'Snails and soft frog calls become more likely.' },
    rain: { name: 'Rain expected', emoji: '🌧️', hint: 'Rain listeners and hidden bottles may surface.' },
    fog: { name: 'Fog expected', emoji: '🌫️', hint: 'Quiet visitors and old lanterns favor the mist.' },
    wind: { name: 'Wind in the reeds', emoji: '🍃', hint: 'Feathers and passing shadows may cross the pond.' },
    snow: { name: 'Winter stillness', emoji: '❄️', hint: 'The owl and tiny tracks become easier to notice.' },
  };
  return {
    dayKey: getUtcDayKey(tomorrow),
    season: tomorrowPond.season,
    weather: tomorrowPond.weather,
    ...copy[tomorrowPond.weather],
  };
}

function themeIdForDay(dayKey: string, season: PondSeason): PondThemeId {
  const seed = hashString(`pond:${dayKey}`);
  if (seed % STARFALL_ODDS === 0) return 'shooting-star';

  const seasonPools: Record<PondSeason, PondThemeId[]> = {
    spring: ['moon', 'rain', 'blossom', 'lotus', 'rainbow', 'fireflies'],
    summer: ['moon', 'rain', 'fireflies', 'lotus', 'rainbow', 'blossom'],
    autumn: ['moon', 'rain', 'autumn', 'fireflies', 'lotus', 'rainbow'],
    winter: ['moon', 'winter', 'rain', 'shooting-star', 'rainbow'],
  };

  const pool = seasonPools[season];
  return pool[seed % pool.length];
}

function chooseThemeIndex(dayKey: string, season: PondSeason): number {
  const candidate = themeIdForDay(dayKey, season);
  const previousDayKey = shiftDayKey(dayKey, -1);
  const previousSeason = getPondSeason(dateFromDayKey(previousDayKey));
  const previous = themeIdForDay(previousDayKey, previousSeason);

  let selectedId = candidate;
  if (candidate === previous && candidate !== 'shooting-star') {
    const pool: PondThemeId[] = season === 'spring'
      ? ['moon', 'rain', 'blossom', 'lotus', 'rainbow', 'fireflies']
      : season === 'summer'
        ? ['moon', 'rain', 'fireflies', 'lotus', 'rainbow', 'blossom']
        : season === 'autumn'
          ? ['moon', 'rain', 'autumn', 'fireflies', 'lotus', 'rainbow']
          : ['moon', 'winter', 'rain', 'shooting-star', 'rainbow'];

    const candidateIndex = pool.indexOf(candidate);
    const offset = 1 + (hashString(`pond-reroll:${dayKey}`) % (pool.length - 1));
    selectedId = pool[(candidateIndex + offset) % pool.length];

    if (selectedId === previous) {
      selectedId = pool[(pool.indexOf(selectedId) + 1) % pool.length];
    }
  }

  return Math.max(0, THEMES.findIndex((theme) => theme.id === selectedId));
}

function getCombinationLabel(weather: PondWeather, eventLabel: string, macroName?: string): string {
  const weatherName = WEATHER_DETAILS[weather].label;
  return macroName ? `${weatherName} · ${eventLabel} · ${macroName}` : `${weatherName} · ${eventLabel}`;
}

function dateFromDayKey(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

function shiftDayKey(dayKey: string, amount: number): string {
  const date = dateFromDayKey(dayKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return getUtcDayKey(date);
}

function pickDaily<T>(dayKey: string, namespace: string, values: readonly T[]): T {
  return values[hashString(`${namespace}:${dayKey}`) % values.length];
}

function pickDailyWithoutImmediateRepeat<T>(
  dayKey: string,
  namespace: string,
  values: readonly T[],
): T {
  const selectedIndex = hashString(`${namespace}:${dayKey}`) % values.length;
  if (values.length < 2) return values[selectedIndex];

  const previousDayKey = shiftDayKey(dayKey, -1);
  const previousIndex = hashString(`${namespace}:${previousDayKey}`) % values.length;

  return values[selectedIndex === previousIndex ? (selectedIndex + 1) % values.length : selectedIndex];
}

function getDailyStory(
  dayKey: string,
  theme: PondThemeId,
  weather: PondWeather,
  season: PondSeason,
  moonPhase: MoonPhase,
  macroName?: string,
): { storyTitle: string; dailyNarrative: string; interactionHint: string; visitStatus: string } {
  const weatherStories: Record<PondWeather, readonly string[]> = {
    clear: [
      'The water has been holding the sky so carefully that even the reeds seem reluctant to interrupt it.',
      'A bright path crossed the pond before sunrise, then vanished beneath the lilies.',
      'The far bank looks ordinary today. Toby does not seem convinced.',
    ],
    drizzle: [
      'Small rings have been writing and rewriting the same quiet message across the water.',
      'The drizzle softened every sound except the tiny footsteps near the reeds.',
      'A silver rain has followed Toby from one lily pad to the next.',
    ],
    rain: [
      'The rain arrived before dawn and left the whole pond speaking in ripples.',
      'Something splashed beyond the reeds just as the heaviest rain began.',
      'The shoreline is darker today, as though the pond is keeping a secret.',
    ],
    fog: [
      'The far bank disappeared before sunrise, but something still moved beyond the reeds.',
      'The mist has hidden the shoreline and left only the nearest lily pads behind.',
      'Toby has been watching one pale shape drift where the water should be empty.',
    ],
    wind: [
      'The breeze carried a small story across the pond, but the reeds would not repeat it.',
      'Every leaf is moving in the same direction except one.',
      'The wind crossed the pond twice today. The second time, Toby looked up.',
    ],
    snow: [
      'The pond woke beneath a hush so complete that one tiny track became a whole mystery.',
      'Snow gathered at the shoreline while the center of the pond stayed strangely clear.',
      'Everything is white today except the path leading toward Toby.',
    ],
  };

  const themeStories: Partial<Record<PondThemeId, readonly string[]>> = {
    fireflies: [
      'The first light appeared near the reeds. A hundred more followed without a sound.',
      'One firefly has been circling Toby as though it recognizes him.',
    ],
    blossom: [
      'A blossom landed beside Toby and refused to drift away.',
      'The petals arrived one at a time until the pond looked as though it had remembered spring.',
    ],
    lotus: [
      'A lotus opened earlier than the others, facing the place where Toby waits.',
      'The newest bloom holds one bright drop that has not fallen all morning.',
    ],
    autumn: [
      'A red leaf has circled the pond three times without touching the shore.',
      'The oldest leaf in the pond drifted back toward the tree it came from.',
    ],
    rainbow: [
      'For one moment, the pond held every color without disturbing a single ripple.',
      'The rainbow touched the water exactly where Toby had been looking.',
    ],
    'shooting-star': [
      'A bright line crossed the sky and left a second reflection behind.',
      'Toby looked up before the star appeared, as though he already knew.',
    ],
    moon: [
      moonPhase === 'full'
        ? 'The moon will fit perfectly inside the pond tonight. Toby appears to be waiting for it.'
        : 'Moonlight reached the pond in a narrow silver path and stopped beside Toby.',
    ],
    winter: [
      'The cold has made the pond quiet enough to hear the reeds settle.',
    ],
    rain: [
      'Every raindrop found the pond. One seemed to find Toby.',
    ],
  };

  const titleByMood: Record<PondMood, readonly string[]> = {
    bright: ['A bright little mystery', 'The pond wakes gently', 'Something near the lilies'],
    quiet: ['The ripple remains', 'A quiet note from the pond', 'Still water, small signs'],
    restless: ['The reeds are speaking', 'A story crossed the water', 'The pond will not sit still'],
    mysterious: ['Beyond the nearest reeds', 'The shoreline disappeared', 'Something moved in the mist'],
    glowing: ['Lights over the water', 'The pond kept one bright secret', 'A glow among the lilies'],
  };

  const mood = getMood(theme, weather);
  const narrativePool = themeStories[theme]?.length ? themeStories[theme]! : weatherStories[weather];
  const macroPrefix = macroName ? `${macroName} has touched the pond. ` : '';
  const seasonHint: Record<PondSeason, readonly string[]> = {
    spring: ['Toby seems curious today.', 'Something new is stirring near the reeds.'],
    summer: ['Stay a moment. The pond is still waking up.', 'Toby keeps glancing toward the water.'],
    autumn: ['Watch the drifting leaves.', 'Toby seems to be listening.'],
    winter: ['The quiet may reveal something.', 'Look closely at the shoreline.'],
  };

  return {
    storyTitle: pickDailyWithoutImmediateRepeat(dayKey, `story-title:${mood}`, titleByMood[mood]),
    dailyNarrative: `${macroPrefix}${pickDailyWithoutImmediateRepeat(dayKey, `story-body:${theme}:${weather}`, narrativePool)}`,
    interactionHint: pickDailyWithoutImmediateRepeat(dayKey, `interaction-hint:${season}`, seasonHint[season]),
    visitStatus: pickDailyWithoutImmediateRepeat(dayKey, 'visit-status', [
      'The pond remembers your visit.',
      'Today’s ripple has been recorded.',
      'Toby will keep this moment until tomorrow.',
      'Your visit has become part of the pond.',
    ] as const),
  };
}

function buildDailyPond(date: Date, includeForecast: boolean): TodaysPond {
  const dayKey = getUtcDayKey(date);
  const moonSeed = hashString(`moon:${dayKey}`);
  const goldenSeed = hashString(`golden:${dayKey}`);
  const season = getPondSeason(date);
  const theme = THEMES[chooseThemeIndex(dayKey, season)];
  const moonPhase = MOON_PHASES[moonSeed % MOON_PHASES.length];
  const weather = theme.id === 'rain' ? 'rain' : theme.id === 'winter' ? 'snow' : getWeather(dayKey, season);
  const curiosity = getCuriosityCopy(theme.id, weather, moonPhase);
  const event = EVENT_DETAILS[theme.id];
  const weatherDetails = WEATHER_DETAILS[weather];
  const seasonal = getSeasonalEvent(date);
  const macroEvent = seasonal ? {
    key: seasonal.key,
    name: seasonal.name,
    emoji: seasonal.emoji,
    description: seasonal.description,
    visualKind: seasonal.visualKind,
  } : null;

  const story = getDailyStory(dayKey, theme.id, weather, season, moonPhase, macroEvent?.name);

  return {
    ...theme,
    moonPhase,
    goldenToby: goldenSeed % GOLDEN_TOBY_ODDS === 0,
    season,
    weather,
    mood: getMood(theme.id, weather),
    curiosityTitle: curiosity.title,
    curiosityBody: curiosity.body,
    forecast: includeForecast
      ? buildForecast(date)
      : {
          dayKey,
          season,
          weather,
          name: weatherDetails.label,
          emoji: weatherDetails.emoji,
          hint: '',
        },
    eventKind: event.kind,
    eventLabel: event.label,
    weatherLabel: weatherDetails.label,
    weatherEmoji: weatherDetails.emoji,
    macroEvent,
    combinationLabel: getCombinationLabel(weather, event.label, macroEvent?.name),
    ...story,
  };
}

export function getTodaysPond(date = new Date()): TodaysPond {
  return buildDailyPond(date, true);
}
