export type SeasonalEventKey =
  | 'new_year'
  | 'lunar_new_year'
  | 'valentines'
  | 'international_womens_day'
  | 'spring_awakening'
  | 'world_water_day'
  | 'earth_day'
  | 'may_day'
  | 'world_environment_day'
  | 'summer_solstice'
  | 'friendship_day'
  | 'mid_autumn'
  | 'world_animal_day'
  | 'halloween'
  | 'diwali'
  | 'thanksgiving'
  | 'winter_solstice'
  | 'winter_lights';

export type SeasonalVisualKind =
  | 'first-light'
  | 'red-lanterns'
  | 'heartleaves'
  | 'violet-bloom'
  | 'spring-awakening'
  | 'blue-ripples'
  | 'earth-bloom'
  | 'flower-crowns'
  | 'wildlife-day'
  | 'longest-light'
  | 'friendship-ripples'
  | 'moon-lanterns'
  | 'animal-parade'
  | 'lantern-pumpkins'
  | 'festival-lights'
  | 'gathering-leaves'
  | 'longest-night'
  | 'winter-lights';

export type SeasonalEvent = {
  key: SeasonalEventKey;
  name: string;
  emoji: string;
  description: string;
  visualKind: SeasonalVisualKind;
  notificationTitle: string;
  notificationBody: string;
  secretKey: string;
  secretName: string;
  secretDescription: string;
};

function utcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isBetween(date: Date, start: Date, end: Date): boolean {
  const value = utcDateOnly(date).getTime();
  return value >= start.getTime() && value <= end.getTime();
}

function dateWindow(year: number, month: number, day: number, radius = 1): [Date, Date] {
  return [
    new Date(Date.UTC(year, month, day - radius)),
    new Date(Date.UTC(year, month, day + radius)),
  ];
}

function fourthThursdayOfNovember(year: number): Date {
  const first = new Date(Date.UTC(year, 10, 1));
  const offset = (4 - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, 10, 1 + offset + 21));
}

const LUNAR_NEW_YEAR: Record<number, [number, number]> = {
  2026: [1, 17], 2027: [1, 6], 2028: [0, 26], 2029: [1, 13], 2030: [1, 2],
};

const MID_AUTUMN: Record<number, [number, number]> = {
  2026: [8, 25], 2027: [8, 15], 2028: [9, 3], 2029: [8, 22], 2030: [8, 12],
};

const DIWALI: Record<number, [number, number]> = {
  2026: [10, 8], 2027: [9, 29], 2028: [9, 17], 2029: [10, 5], 2030: [9, 26],
};

function variableEventWindow(date: Date, dates: Record<number, [number, number]>, radius = 1): boolean {
  const entry = dates[date.getUTCFullYear()];
  if (!entry) return false;
  const [month, day] = entry;
  const [start, end] = dateWindow(date.getUTCFullYear(), month, day, radius);
  return isBetween(date, start, end);
}

export function getSeasonalEvent(date = new Date()): SeasonalEvent | null {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  if ((month === 11 && day >= 31) || (month === 0 && day <= 2)) return {
    key: 'new_year', name: 'First Light Pond', emoji: '✨', visualKind: 'first-light',
    description: 'The first ripples of a new year move across the water.',
    notificationTitle: 'A new pond year begins ✨', notificationBody: 'The first ripple of a new chapter is waiting at Toby Hop.',
    secretKey: 'first_ripple_of_the_year', secretName: 'First Ripple of the Year', secretDescription: 'You returned as one pond year became the next.',
  };

  if (variableEventWindow(date, LUNAR_NEW_YEAR, 2)) return {
    key: 'lunar_new_year', name: 'Lantern New Year', emoji: '🏮', visualKind: 'red-lanterns',
    description: 'Red lanterns glow while koi trace lucky circles below.',
    notificationTitle: 'Lanterns reached the pond 🏮', notificationBody: 'A bright new lunar year is stirring the koi and reeds.',
    secretKey: 'lantern_first_ripple', secretName: 'Lantern First Ripple', secretDescription: 'You visited while lantern light welcomed a new lunar year.',
  };

  if (month === 1 && day >= 12 && day <= 15) return {
    key: 'valentines', name: 'Heartleaf Days', emoji: '💗', visualKind: 'heartleaves',
    description: 'Heart-shaped leaves drift in quiet pairs.', notificationTitle: 'Heartleaves are drifting 💗',
    notificationBody: 'A small seasonal secret can be found at the pond today.', secretKey: 'heartleaf', secretName: 'Heartleaf',
    secretDescription: 'A heart-shaped leaf crossed your path during Heartleaf Days.',
  };

  if (month === 2 && day === 8) return {
    key: 'international_womens_day', name: 'Violet Bloom', emoji: '💜', visualKind: 'violet-bloom',
    description: 'Violet flowers open around the oldest reeds.', notificationTitle: 'Violets opened at the pond 💜',
    notificationBody: 'The shoreline is honoring strength, care, and every path forward.', secretKey: 'violet_current', secretName: 'Violet Current',
    secretDescription: 'You found violet blooms moving with a strong and steady current.',
  };

  if (month === 2 && day >= 19 && day <= 22) return {
    key: 'spring_awakening', name: 'Spring Awakening', emoji: '🌱', visualKind: 'spring-awakening', description: 'Tadpoles and fresh reeds announce the season.',
    notificationTitle: 'The pond is waking 🌱', notificationBody: 'Spring has reached Toby Hop. Visit to uncover the season’s first sign.',
    secretKey: 'first_green_ripple', secretName: 'First Green Ripple', secretDescription: 'You witnessed the pond stirring at the start of spring.',
  };

  if (month === 2 && day >= 21 && day <= 23) return {
    key: 'world_water_day', name: 'Blue Ripple Days', emoji: '💧', visualKind: 'blue-ripples', description: 'Clear blue rings travel farther than usual.',
    notificationTitle: 'Blue ripples are crossing the pond 💧', notificationBody: 'The water is especially clear today. Stay long enough to notice what lives below.',
    secretKey: 'clear_water_witness', secretName: 'Clear Water Witness', secretDescription: 'You returned while the pond honored the water that sustains it.',
  };

  if (month === 3 && day >= 21 && day <= 23) return {
    key: 'earth_day', name: 'Earth Day Pond', emoji: '🌎', visualKind: 'earth-bloom', description: 'The whole shoreline seems greener and more awake.',
    notificationTitle: 'The pond is listening 🌎', notificationBody: 'Wildlife is unusually active around the Earth Day pond.',
    secretKey: 'keeper_of_the_pond', secretName: 'Keeper of the Pond', secretDescription: 'You visited while the pond honored the living world around it.',
  };

  if (month === 4 && day === 1) return {
    key: 'may_day', name: 'Flower Crown Pond', emoji: '🌼', visualKind: 'flower-crowns', description: 'Wildflowers gather along the bank like tiny crowns.',
    notificationTitle: 'Wildflowers ring the pond 🌼', notificationBody: 'The first day of May has dressed the shoreline in color.',
    secretKey: 'crown_of_wildflowers', secretName: 'Crown of Wildflowers', secretDescription: 'You found the pond wearing its first bright crown of May.',
  };

  if (month === 5 && day >= 4 && day <= 6) return {
    key: 'world_environment_day', name: 'Wild Shore Day', emoji: '🌿', visualKind: 'wildlife-day', description: 'Native visitors gather where the reeds grow thickest.',
    notificationTitle: 'The wild shore is busy 🌿', notificationBody: 'More creatures than usual are moving through the pond today.',
    secretKey: 'wild_shore_keeper', secretName: 'Wild Shore Keeper', secretDescription: 'You witnessed the pond at its most crowded with living things.',
  };

  if (month === 5 && day >= 19 && day <= 22) return {
    key: 'summer_solstice', name: 'Longest Light', emoji: '☀️', visualKind: 'longest-light', description: 'Sunlight lingers over the pond and dragonflies stay late.',
    notificationTitle: 'The longest light has arrived ☀️', notificationBody: 'A solstice secret is waiting beside the bright pond.',
    secretKey: 'longest_light', secretName: 'Longest Light', secretDescription: 'You hopped during the brightest days of the pond year.',
  };

  if (month === 6 && day === 30) return {
    key: 'friendship_day', name: 'Friendship Ripples', emoji: '🤝', visualKind: 'friendship-ripples', description: 'Pairs of ripples meet and travel onward together.',
    notificationTitle: 'Two ripples met at the pond 🤝', notificationBody: 'The pond is celebrating the paths that cross and continue together.',
    secretKey: 'two_ripples', secretName: 'Two Ripples', secretDescription: 'You watched two currents meet without losing their way.',
  };

  if (variableEventWindow(date, MID_AUTUMN, 1)) return {
    key: 'mid_autumn', name: 'Moon Lantern Pond', emoji: '🥮', visualKind: 'moon-lanterns', description: 'Lanterns drift beneath an unusually bright moon.',
    notificationTitle: 'Moon lanterns are afloat 🌕', notificationBody: 'The pond is glowing for the Mid-Autumn moon tonight.',
    secretKey: 'lantern_beneath_the_moon', secretName: 'Lantern Beneath the Moon', secretDescription: 'You found a lantern reflected beneath the harvest moon.',
  };

  if (month === 9 && day >= 3 && day <= 5) return {
    key: 'world_animal_day', name: 'Animal Gathering', emoji: '🐾', visualKind: 'animal-parade', description: 'Tracks, wings, and small wakes surround the pond.',
    notificationTitle: 'The animals are gathering 🐾', notificationBody: 'Visitors from every corner of the shore are appearing today.',
    secretKey: 'friend_to_every_creature', secretName: 'Friend to Every Creature', secretDescription: 'You visited while the pond welcomed every kind of traveler.',
  };

  if (month === 9 && day >= 27 && day <= 31) return {
    key: 'halloween', name: 'Lantern Pond', emoji: '🎃', visualKind: 'lantern-pumpkins', description: 'Pumpkin lights drift while strange shadows cross the water.',
    notificationTitle: 'Lantern Pond is open 🎃', notificationBody: 'Something strange is moving beneath the October water.',
    secretKey: 'lantern_below', secretName: 'The Lantern Below', secretDescription: 'A warm light answered from beneath the Halloween pond.',
  };

  if (variableEventWindow(date, DIWALI, 1)) return {
    key: 'diwali', name: 'Festival of Lights Pond', emoji: '🪔', visualKind: 'festival-lights', description: 'Rows of warm lights shimmer along the bank.',
    notificationTitle: 'The shoreline is filled with light 🪔', notificationBody: 'A festival glow is moving across the pond tonight.',
    secretKey: 'light_over_dark_water', secretName: 'Light Over Dark Water', secretDescription: 'You found a steady row of lights reflected across the dark pond.',
  };

  const thanksgiving = fourthThursdayOfNovember(year);
  const thanksgivingStart = new Date(thanksgiving); thanksgivingStart.setUTCDate(thanksgiving.getUTCDate() - 1);
  const thanksgivingEnd = new Date(thanksgiving); thanksgivingEnd.setUTCDate(thanksgiving.getUTCDate() + 2);
  if (isBetween(date, thanksgivingStart, thanksgivingEnd)) return {
    key: 'thanksgiving', name: 'Gathering Pond', emoji: '🍂', visualKind: 'gathering-leaves', description: 'Leaves and visitors gather close to the warm bank.',
    notificationTitle: 'The pond gathers close 🍂', notificationBody: 'Visit during Gathering Pond to reveal a seasonal journal entry.',
    secretKey: 'gathered_at_the_water', secretName: 'Gathered at the Water', secretDescription: 'You returned during the pond’s season of gathering.',
  };

  if (month === 11 && day >= 19 && day <= 22) return {
    key: 'winter_solstice', name: 'Longest Night Pond', emoji: '🌌', visualKind: 'longest-night', description: 'The longest night deepens every reflection.',
    notificationTitle: 'The longest night has reached the pond 🌌', notificationBody: 'Moonlight and quiet visitors linger longer tonight.',
    secretKey: 'keeper_of_the_longest_night', secretName: 'Keeper of the Longest Night', secretDescription: 'You stayed with the pond through the year’s longest darkness.',
  };

  if (month === 11 && day >= 23 && day <= 30) return {
    key: 'winter_lights', name: 'Winter Lights', emoji: '❄️', visualKind: 'winter-lights', description: 'Soft lights glow against the winter shoreline.',
    notificationTitle: 'Winter lights are glowing ❄️', notificationBody: 'A quiet seasonal secret is waiting at the frozen pond.',
    secretKey: 'winter_lantern', secretName: 'Winter Lantern', secretDescription: 'You found a steady light during the darkest pond days.',
  };

  return null;
}
