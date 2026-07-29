import { supabaseAdmin } from '@/lib/supabase/admin';
import { getSeasonalEvent } from '../seasonal-calendar';
import type { EventProcessor, TobyEvent } from '../dispatcher';

type SecretCandidate = {
  key: string;
  name: string;
  description: string;
  source: string;
};

function readNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function collectCandidates(event: TobyEvent): SecretCandidate[] {
  const metadata = event.metadata ?? {};
  const candidates: SecretCandidate[] = [];
  const streak = readNumber(metadata, 'streak') ?? 0;
  const totalHops = readNumber(metadata, 'totalHops') ?? 0;
  const pondTheme = readString(metadata, 'pondTheme');
  const moonPhase = readString(metadata, 'moonPhase');
  const encounterCategory = readString(metadata, 'encounterCategory');
  const weather = readString(metadata, 'pondWeather');
  const season = readString(metadata, 'pondSeason');
  const mood = readString(metadata, 'pondMood');
  const pondEvent = readString(metadata, 'pondEvent');
  const macroEvent = readString(metadata, 'pondMacroEvent');
  const occurredAt = event.timestamp ?? new Date();
  const hour = occurredAt.getUTCHours();

  if (streak >= 7) {
    candidates.push({
      key: 'seven_quiet_returns',
      name: 'Seven Quiet Returns',
      description: 'You returned to the pond for seven days without breaking the rhythm.',
      source: 'streak',
    });
  }

  if (totalHops >= 100) {
    candidates.push({
      key: 'the_pond_remembered_you',
      name: 'The Pond Remembered You',
      description: 'One hundred hops left a lasting echo in the water.',
      source: 'milestone',
    });
  }

  if (pondTheme === 'rain') {
    candidates.push({
      key: 'rain_listener',
      name: 'Rain Listener',
      description: 'You heard what the pond says only when the rain is falling.',
      source: 'pond_theme',
    });
  }

  if (pondTheme === 'shooting-star') {
    candidates.push({
      key: 'wish_between_ripples',
      name: 'Wish Between Ripples',
      description: 'A falling star crossed the pond during your hop.',
      source: 'pond_theme',
    });
  }

  if (moonPhase === 'full' && (hour >= 22 || hour < 5)) {
    candidates.push({
      key: 'midnight_full_moon',
      name: 'Midnight Full Moon',
      description: 'You found the pond awake beneath a full moon.',
      source: 'moon',
    });
  }

  if (encounterCategory === 'golden') {
    candidates.push({
      key: 'golden_witness',
      name: 'Golden Witness',
      description: 'You were present when Golden Toby surfaced.',
      source: 'encounter',
    });
  }

  if (weather === 'fog') {
    candidates.push({ key: 'mist_walker', name: 'Mist Walker', description: 'You crossed the pond while the shoreline was hidden in fog.', source: 'weather' });
  }

  if (weather === 'wind') {
    candidates.push({ key: 'reed_reader', name: 'Reed Reader', description: 'You listened while the wind translated the reeds.', source: 'weather' });
  }

  if (season === 'spring' && totalHops >= 3) {
    candidates.push({ key: 'spring_witness', name: 'Spring Witness', description: 'You returned while new life stirred beneath the water.', source: 'season' });
  }

  if (season === 'autumn' && streak >= 5) {
    candidates.push({ key: 'keeper_of_leaves', name: 'Keeper of Leaves', description: 'Five autumn returns left a trail of gold across your journal.', source: 'season' });
  }

  if (mood === 'mysterious' && (hour >= 21 || hour < 5)) {
    candidates.push({ key: 'after_the_reeds', name: 'After the Reeds', description: 'You stayed when the pond felt different and the shore went quiet.', source: 'mood' });
  }


  if (weather === 'drizzle') {
    candidates.push({ key: 'silver_drizzle', name: 'Silver Drizzle', description: 'You crossed while the smallest rain stitched silver rings into the pond.', source: 'weather' });
  }

  if (weather === 'snow') {
    candidates.push({ key: 'winter_footprints', name: 'Winter Footprints', description: 'You found tiny tracks where the snow met the reeds.', source: 'weather' });
  }

  if (weather === 'clear' && moonPhase === 'full' && (hour >= 19 || hour < 5)) {
    candidates.push({ key: 'mirror_moon', name: 'Mirror Moon', description: 'The full moon appeared twice: once above and once below.', source: 'combination' });
  }

  if (weather === 'rain' && moonPhase === 'full') {
    candidates.push({ key: 'moon_rain', name: 'Moon Rain', description: 'Moonlight survived every ripple of the rain.', source: 'combination' });
  }

  if (pondEvent === 'firefly-bloom' && weather === 'fog') {
    candidates.push({ key: 'lights_in_the_mist', name: 'Lights in the Mist', description: 'Fireflies turned the fog into a field of distant stars.', source: 'combination' });
  }

  if (pondEvent === 'rainbow' && weather === 'drizzle') {
    candidates.push({ key: 'rain_after_color', name: 'Rain After Color', description: 'A rainbow held its shape while the drizzle continued.', source: 'combination' });
  }

  if (pondEvent === 'lotus-bloom' && moonPhase === 'full') {
    candidates.push({ key: 'moon_lotus_keeper', name: 'Moon Lotus Keeper', description: 'A lotus opened only after the moon found it.', source: 'combination' });
  }

  if (season === 'summer' && pondEvent === 'firefly-bloom') {
    candidates.push({ key: 'summer_lanterns', name: 'Summer Lanterns', description: 'You found the reeds lit by a hundred tiny summer lamps.', source: 'season' });
  }

  if (season === 'winter' && totalHops >= 10) {
    candidates.push({ key: 'winter_regular', name: 'Winter Regular', description: 'Even the cold pond recognized your return.', source: 'season' });
  }

  if (streak >= 30) {
    candidates.push({ key: 'thirty_still_mornings', name: 'Thirty Still Mornings', description: 'Thirty unbroken returns taught the pond your footsteps.', source: 'streak' });
  }

  if (streak >= 100) {
    candidates.push({ key: 'the_long_patience', name: 'The Long Patience', description: 'One hundred quiet returns made you part of the shoreline.', source: 'streak' });
  }

  if (macroEvent === 'world_animal_day') {
    candidates.push({ key: 'tracks_everywhere', name: 'Tracks Everywhere', description: 'Every bank, reed, and muddy stone carried a visitor’s sign.', source: 'macro_event' });
  }

  const seasonal = getSeasonalEvent(occurredAt);
  if (seasonal) {
    candidates.push({
      key: seasonal.secretKey,
      name: seasonal.secretName,
      description: seasonal.secretDescription,
      source: `seasonal:${seasonal.key}`,
    });
  }

  return candidates;
}

async function unlockSecret(event: TobyEvent, candidate: SecretCandidate): Promise<boolean> {
  const db = supabaseAdmin();
  const unlockedAt = (event.timestamp ?? new Date()).toISOString();

  const { error } = await db.from('toby_hop_user_secrets').insert({
    fid: event.fid,
    secret_key: candidate.key,
    secret_name: candidate.name,
    description: candidate.description,
    source: candidate.source,
    metadata: event.metadata ?? {},
    unlocked_at: unlockedAt,
  });

  if (!error) return true;
  if (error.code === '23505') return false;
  if (error.code === '42P01') {
    console.warn('toby_hop_user_secrets table is not installed; secret was not persisted.');
    return false;
  }
  throw error;
}

export const runSecretProcessor: EventProcessor = {
  name: 'Secrets',

  async handle(event) {
    if (event.type !== 'hop_completed') return;

    for (const candidate of collectCandidates(event)) {
      const unlocked = await unlockSecret(event, candidate);
      if (!unlocked) continue;

      const metadata = {
        ...(event.metadata ?? {}),
        secretKey: candidate.key,
        secretName: candidate.name,
        secretDescription: candidate.description,
        secretSource: candidate.source,
      };

      // Invoke only the notification processor path through the dispatcher event type.
      const { processEvent } = await import('../dispatcher');
      await processEvent({
        type: 'secret_found',
        fid: event.fid,
        wallet: event.wallet,
        timestamp: event.timestamp,
        metadata,
      });
    }
  },
};
