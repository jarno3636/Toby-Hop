export type SeasonalEventKey =
  | 'new_year'
  | 'valentines'
  | 'spring_awakening'
  | 'earth_day'
  | 'summer_solstice'
  | 'halloween'
  | 'thanksgiving'
  | 'winter_lights';

export type SeasonalEvent = {
  key: SeasonalEventKey;
  name: string;
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

function fourthThursdayOfNovember(year: number): Date {
  const first = new Date(Date.UTC(year, 10, 1));
  const offset = (4 - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, 10, 1 + offset + 21));
}

export function getSeasonalEvent(date = new Date()): SeasonalEvent | null {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  if ((month === 11 && day >= 31) || (month === 0 && day <= 2)) {
    return {
      key: 'new_year',
      name: 'New Year at the Pond',
      notificationTitle: 'A new pond year begins ✨',
      notificationBody: 'Make the first hop of a new chapter and reveal a seasonal journal secret.',
      secretKey: 'first_ripple_of_the_year',
      secretName: 'First Ripple of the Year',
      secretDescription: 'You returned as one pond year became the next.',
    };
  }

  if (month === 1 && day >= 12 && day <= 15) {
    return {
      key: 'valentines',
      name: 'Heartleaf Days',
      notificationTitle: 'Heartleaves are drifting 💗',
      notificationBody: 'A small seasonal secret can be found at the pond today.',
      secretKey: 'heartleaf',
      secretName: 'Heartleaf',
      secretDescription: 'A heart-shaped leaf crossed your path during Heartleaf Days.',
    };
  }

  if (month === 2 && day >= 19 && day <= 22) {
    return {
      key: 'spring_awakening',
      name: 'Spring Awakening',
      notificationTitle: 'The pond is waking 🌱',
      notificationBody: 'Spring has reached Toby Hop. Visit to uncover the season’s first sign.',
      secretKey: 'first_green_ripple',
      secretName: 'First Green Ripple',
      secretDescription: 'You witnessed the pond stirring at the start of spring.',
    };
  }

  if (month === 3 && day >= 21 && day <= 23) {
    return {
      key: 'earth_day',
      name: 'Earth Day Pond',
      notificationTitle: 'The pond is listening 🌎',
      notificationBody: 'Return during Earth Day to add a quiet keepsake to your journal.',
      secretKey: 'keeper_of_the_pond',
      secretName: 'Keeper of the Pond',
      secretDescription: 'You visited while the pond honored the living world around it.',
    };
  }

  if (month === 5 && day >= 19 && day <= 22) {
    return {
      key: 'summer_solstice',
      name: 'Longest Light',
      notificationTitle: 'The longest light has arrived ☀️',
      notificationBody: 'A solstice secret is waiting beside the bright pond.',
      secretKey: 'longest_light',
      secretName: 'Longest Light',
      secretDescription: 'You hopped during the brightest days of the pond year.',
    };
  }

  if (month === 9 && day >= 27 && day <= 31) {
    return {
      key: 'halloween',
      name: 'Lantern Pond',
      notificationTitle: 'Lantern Pond is open 🎃',
      notificationBody: 'Something strange is moving beneath the October water.',
      secretKey: 'lantern_below',
      secretName: 'The Lantern Below',
      secretDescription: 'A warm light answered from beneath the Halloween pond.',
    };
  }

  const thanksgiving = fourthThursdayOfNovember(year);
  const thanksgivingStart = new Date(thanksgiving);
  thanksgivingStart.setUTCDate(thanksgiving.getUTCDate() - 1);
  const thanksgivingEnd = new Date(thanksgiving);
  thanksgivingEnd.setUTCDate(thanksgiving.getUTCDate() + 2);
  if (isBetween(date, thanksgivingStart, thanksgivingEnd)) {
    return {
      key: 'thanksgiving',
      name: 'Gathering Pond',
      notificationTitle: 'The pond gathers close 🍂',
      notificationBody: 'Visit during Gathering Pond to reveal a seasonal journal entry.',
      secretKey: 'gathered_at_the_water',
      secretName: 'Gathered at the Water',
      secretDescription: 'You returned during the pond’s season of gathering.',
    };
  }

  if (month === 11 && day >= 20 && day <= 30) {
    return {
      key: 'winter_lights',
      name: 'Winter Lights',
      notificationTitle: 'Winter lights are glowing ❄️',
      notificationBody: 'A quiet holiday secret is waiting at the frozen pond.',
      secretKey: 'winter_lantern',
      secretName: 'Winter Lantern',
      secretDescription: 'You found a steady light during the darkest pond days.',
    };
  }

  return null;
}
