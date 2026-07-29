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
};

export const GOLDEN_TOBY_ODDS = 1000;
export const GOLDEN_TOBY_PERCENT = 100 / GOLDEN_TOBY_ODDS;
export const STARFALL_ODDS = 97;
export const STARFALL_PERCENT = 100 / STARFALL_ODDS;

const THEMES: Array<Omit<TodaysPond, 'goldenToby' | 'moonPhase' | 'season' | 'weather' | 'mood' | 'curiosityTitle' | 'curiosityBody' | 'forecast' | 'eventKind' | 'eventLabel' | 'weatherLabel' | 'weatherEmoji' | 'macroEvent' | 'combinationLabel'>> = [
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

function getWeather(dayKey: string, season: PondSeason): PondWeather {
  const roll = hashString(`weather:${dayKey}`) % 100;
  if (season === 'winter' && roll < 15) return 'snow';
  if (roll < 15) return 'fog';
  if (roll < 28) return 'drizzle';
  if (roll < 39) return 'rain';
  if (roll < 54) return 'wind';
  return 'clear';
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

function chooseThemeIndex(dayKey: string, season: PondSeason): number {
  const seed = hashString(`pond:${dayKey}`);
  if (seed % STARFALL_ODDS === 0) return THEMES.length - 1;

  const seasonPools: Record<PondSeason, PondThemeId[]> = {
    spring: ['moon', 'rain', 'blossom', 'lotus', 'rainbow', 'fireflies'],
    summer: ['moon', 'rain', 'fireflies', 'lotus', 'rainbow', 'blossom'],
    autumn: ['moon', 'rain', 'autumn', 'fireflies', 'lotus', 'rainbow'],
    winter: ['moon', 'winter', 'rain', 'shooting-star', 'rainbow'],
  };

  const pool = seasonPools[season];
  const selectedId = pool[seed % pool.length];
  return Math.max(0, THEMES.findIndex((theme) => theme.id === selectedId));
}

function getCombinationLabel(weather: PondWeather, eventLabel: string, macroName?: string): string {
  const weatherName = WEATHER_DETAILS[weather].label;
  return macroName ? `${weatherName} · ${eventLabel} · ${macroName}` : `${weatherName} · ${eventLabel}`;
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
  };
}

export function getTodaysPond(date = new Date()): TodaysPond {
  return buildDailyPond(date, true);
}
