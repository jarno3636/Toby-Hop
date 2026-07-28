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
