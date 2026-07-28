import { sendTobyHopNotification } from '@/lib/notifications/send-notification';
import { getSeasonalEvent } from '../seasonal-calendar';
import type { EventProcessor, TobyEvent } from '../dispatcher';

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

function readBoolean(metadata: Record<string, unknown>, key: string): boolean {
  return metadata[key] === true;
}

async function sendRareDiscoveryNotification(event: TobyEvent): Promise<void> {
  const metadata = event.metadata ?? {};
  const encounterId = readString(metadata, 'encounterId');
  const encounterName = readString(metadata, 'encounterName');
  const rarity = readString(metadata, 'encounterRarity');
  const category = readString(metadata, 'encounterCategory');
  const firstDiscovery = readBoolean(metadata, 'encounterFirstDiscovery');
  const isSpecial = category === 'golden' || category === 'secret' || rarity === 'rare' || rarity === 'legendary' || rarity === 'secret';

  if (!encounterId || !encounterName || !firstDiscovery || !isSpecial) return;

  const golden = category === 'golden';
  const secret = category === 'secret' || rarity === 'secret';
  await sendTobyHopNotification({
    fid: event.fid,
    notificationId: `discovery:${encounterId}`,
    type: golden ? 'golden_toby' : secret ? 'secret_discovery' : 'rare_discovery',
    title: golden ? 'Golden Toby found ✨' : secret ? 'The pond revealed a secret' : 'Rare pond discovery ✨',
    body: `${encounterName} was added to your Traveler's Journal.`,
    targetUrl: '/?panel=me',
    pondDate: event.timestamp?.toISOString().slice(0, 10) ?? null,
  });
}

async function sendStreakMilestoneNotification(event: TobyEvent): Promise<void> {
  const streak = readNumber(event.metadata ?? {}, 'streak');
  if (!streak || ![7, 30, 100, 365].includes(streak)) return;

  await sendTobyHopNotification({
    fid: event.fid,
    notificationId: `streak:${streak}:${event.fid}`,
    type: 'streak_milestone',
    title: `${streak} days at the pond`,
    body: `The pond remembers every return. Your ${streak}-day streak is now in the journal.`,
    targetUrl: '/?panel=me',
    pondDate: event.timestamp?.toISOString().slice(0, 10) ?? null,
  });
}

async function sendSecretNotification(event: TobyEvent): Promise<void> {
  const metadata = event.metadata ?? {};
  const secretKey = readString(metadata, 'secretKey');
  const secretName = readString(metadata, 'secretName');
  if (!secretKey || !secretName) return;

  await sendTobyHopNotification({
    fid: event.fid,
    notificationId: `secret:${secretKey}:${event.fid}`,
    type: 'secret_discovery',
    title: 'A pond secret was found ◈',
    body: `${secretName} was added to your Traveler's Journal.`,
    targetUrl: '/?panel=me',
    pondDate: event.timestamp?.toISOString().slice(0, 10) ?? null,
  });
}

async function sendSeasonalNotification(event: TobyEvent): Promise<void> {
  const seasonal = getSeasonalEvent(event.timestamp ?? new Date());
  if (!seasonal) return;

  await sendTobyHopNotification({
    fid: event.fid,
    notificationId: `seasonal:${seasonal.key}:${event.fid}:${(event.timestamp ?? new Date()).getUTCFullYear()}`,
    type: 'seasonal_event',
    title: seasonal.notificationTitle,
    body: seasonal.notificationBody,
    targetUrl: '/',
    pondDate: event.timestamp?.toISOString().slice(0, 10) ?? null,
  });
}

export const runNotificationProcessor: EventProcessor = {
  name: 'Notifications',

  async handle(event) {
    if (event.type === 'secret_found') {
      await sendSecretNotification(event);
      return;
    }

    if (event.type === 'seasonal_event') {
      await sendSeasonalNotification(event);
      return;
    }

    if (event.type !== 'hop_completed') return;
    await Promise.all([
      sendRareDiscoveryNotification(event),
      sendStreakMilestoneNotification(event),
    ]);
  },
};
