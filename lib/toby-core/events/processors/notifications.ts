import { sendTobyHopNotification } from '@/lib/notifications/send-notification';

import type {
  EventProcessor,
  TobyEvent,
} from '../dispatcher';

function readNumber(
  metadata: Record<string, unknown>,
  key: string,
): number | null {
  const value = metadata[key];

  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function readString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];

  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

function readBoolean(
  metadata: Record<string, unknown>,
  key: string,
): boolean {
  return metadata[key] === true;
}

async function sendRareDiscoveryNotification(
  event: TobyEvent,
): Promise<boolean> {
  const metadata = event.metadata ?? {};
  const encounterId = readString(metadata, 'encounterId');
  const encounterName = readString(metadata, 'encounterName');
  const encounterRarity = readString(metadata, 'encounterRarity');
  const encounterCategory = readString(metadata, 'encounterCategory');
  const firstDiscovery = readBoolean(
    metadata,
    'encounterFirstDiscovery',
  );

  const isSpecial =
    encounterCategory === 'golden' ||
    encounterCategory === 'secret' ||
    encounterRarity === 'rare' ||
    encounterRarity === 'legendary' ||
    encounterRarity === 'secret';

  if (
    !encounterId ||
    !encounterName ||
    !firstDiscovery ||
    !isSpecial
  ) {
    return false;
  }

  const golden = encounterCategory === 'golden';

  await sendTobyHopNotification({
    fid: event.fid,
    notificationId: `discovery:${encounterId}`,
    type: golden ? 'golden_toby' : 'rare_discovery',
    title: golden ? 'Golden Toby found' : 'Rare pond discovery',
    body: `${encounterName} was added to your pond journal.`,
    targetUrl: '/',
    pondDate: event.timestamp?.toISOString().slice(0, 10) ?? null,
  });

  return true;
}

async function sendStreakMilestoneNotification(
  event: TobyEvent,
): Promise<void> {
  const metadata = event.metadata ?? {};
  const streak = readNumber(metadata, 'streak');

  if (!streak || ![7, 30, 100, 365].includes(streak)) {
    return;
  }

  await sendTobyHopNotification({
    fid: event.fid,
    notificationId: `streak:${streak}:${event.fid}`,
    type: 'streak_milestone',
    title: `${streak} days at the pond`,
    body: `The pond remembers every return. Your ${streak}-day streak is now in the journal.`,
    targetUrl: '/',
    pondDate: event.timestamp?.toISOString().slice(0, 10) ?? null,
  });
}

export const runNotificationProcessor: EventProcessor = {
  name: 'Notifications',

  async handle(event) {
    if (event.type !== 'hop_completed') {
      return;
    }

    const sentDiscovery =
      await sendRareDiscoveryNotification(event);

    if (!sentDiscovery) {
      await sendStreakMilestoneNotification(event);
    }
  },
};
