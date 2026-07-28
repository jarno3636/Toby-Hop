import {
  runAnalyticsProcessor,
} from './processors/analytics';

import {
  runChallengeProcessor,
} from './processors/challenges';

import {
  runNotificationProcessor,
} from './processors/notifications';

import {
  runSecretProcessor,
} from './processors/secrets';

import {
  runTitleProcessor,
} from './processors/titles';

import {
  runXpProcessor,
} from './processors/xp';

export type TobyEventType =
  | 'hop_completed'
  | 'challenge_completed'
  | 'patch_unlocked'
  | 'golden_toby'
  | 'rainbow_pond'
  | 'daily_login'
  | 'daily_rite_completed'
  | 'atlas_opened'
  | 'passport_viewed'
  | 'notification_opened'
  | 'secret_found'
  | 'friend_invited'
  | 'share_completed';

export interface TobyEvent {
  type: TobyEventType;

  fid: number;

  wallet?: string;

  timestamp?: Date;

  metadata?: Record<string, unknown>;
}

export interface EventProcessor {
  name: string;

  handle(
    event: TobyEvent,
  ): Promise<void>;
}

const processors: EventProcessor[] = [
  runChallengeProcessor,
  runPatchProcessor,
  runXpProcessor,
  runTitleProcessor,
  runSecretProcessor,
  runNotificationProcessor,
  runAnalyticsProcessor,
];

export async function processEvent(
  event: TobyEvent,
): Promise<void> {
  const payload: TobyEvent = {
    ...event,

    timestamp:
      event.timestamp ??
      new Date(),

    metadata:
      event.metadata ??
      {},
  };

  for (const processor of processors) {
    try {
      await processor.handle(
        payload,
      );
    } catch (error) {
      console.error(
        `[Event Processor: ${processor.name}]`,
        error,
      );
    }
  }
}
