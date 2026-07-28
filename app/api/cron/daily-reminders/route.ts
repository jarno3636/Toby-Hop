import { NextResponse } from 'next/server';

import { sendTobyHopNotification } from '@/lib/notifications/send-notification';
import type { TobyHopNotificationType } from '@/lib/notifications/types';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTodaysPond, getUtcDayKey } from '@/lib/todays-pond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 20;

type ReminderUserRow = {
  fid: number;
  current_streak: number | string | null;
  last_hop_at: string | null;
};

type NotificationCopy = {
  type: TobyHopNotificationType;
  title: string;
  body: string;
  campaign: string;
};

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  return request.headers.get('authorization') === `Bearer ${secret}`;
}

function hasHoppedOnUtcDate(
  lastHopAt: string | null,
  dayKey: string,
): boolean {
  if (!lastHopAt) {
    return false;
  }

  const parsed = new Date(lastHopAt);

  return !Number.isNaN(parsed.getTime()) &&
    getUtcDayKey(parsed) === dayKey;
}

function numberFromUnknown(value: unknown): number {
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

  return 0;
}

function notificationForToday(
  dayKey: string,
  user: ReminderUserRow,
): NotificationCopy {
  const pond = getTodaysPond(new Date(`${dayKey}T12:00:00.000Z`));
  const streak = numberFromUnknown(user.current_streak);

  if (pond.goldenToby) {
    return {
      type: 'golden_toby',
      title: 'Golden light at the pond',
      body: 'Something rare is waiting in today’s pond. Make your daily hop before it fades.',
      campaign: 'golden-pond',
    };
  }

  if (pond.id === 'rainbow') {
    return {
      type: 'rainbow_pond',
      title: 'Rainbow Pond is here',
      body: 'The water looks different today. Visit the pond and make your daily hop.',
      campaign: 'rainbow-pond',
    };
  }

  if (pond.id === 'shooting-star') {
    return {
      type: 'seasonal_event',
      title: 'Watch the sky tonight',
      body: 'Starfall Pond has appeared for one day. Return before the sky grows quiet.',
      campaign: 'starfall-pond',
    };
  }

  if (streak > 0) {
    return {
      type: 'streak_warning',
      title: `${streak}-day streak waiting`,
      body: 'Your ripple has not reached the pond today. One hop keeps the streak alive.',
      campaign: 'streak-warning',
    };
  }

  return {
    type: 'daily_hop_reminder',
    title: 'The pond is waiting',
    body: `${pond.name} is here today. Make one small hop and see what the water reveals.`,
    campaign: 'daily-reminder',
  };
}

async function processBatch(
  users: ReminderUserRow[],
  dayKey: string,
) {
  return Promise.all(
    users.map(async (user) => {
      const copy = notificationForToday(dayKey, user);

      return sendTobyHopNotification({
        fid: user.fid,
        notificationId: `${copy.campaign}:${dayKey}:${user.fid}`,
        type: copy.type,
        title: copy.title,
        body: copy.body,
        targetUrl: '/',
        pondDate: dayKey,
      });
    }),
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized.' },
      { status: 401 },
    );
  }

  const dayKey = getUtcDayKey();
  const db = supabaseAdmin();

  const { data, error } = await db
    .from('toby_hop_users')
    .select('fid, current_streak, last_hop_at')
    .eq('notifications_enabled', true)
    .not('notification_url', 'is', null)
    .not('notification_token', 'is', null)
    .not('fid', 'is', null);

  if (error) {
    console.error('[daily-reminders] Unable to load subscribers:', error);

    return NextResponse.json(
      { ok: false, error: 'Unable to load notification subscribers.' },
      { status: 500 },
    );
  }

  const eligible = ((data ?? []) as ReminderUserRow[])
    .filter(
      (user) =>
        Number.isSafeInteger(user.fid) &&
        user.fid > 0 &&
        !hasHoppedOnUtcDate(user.last_hop_at, dayKey),
    );

  const results = [];

  for (let index = 0; index < eligible.length; index += BATCH_SIZE) {
    const batch = eligible.slice(index, index + BATCH_SIZE);
    results.push(...(await processBatch(batch, dayKey)));
  }

  const summary = results.reduce(
    (accumulator, result) => {
      if (result.success) {
        accumulator.sent += 1;
      } else if (result.status === 'duplicate') {
        accumulator.duplicate += 1;
      } else if (
        result.status === 'disabled' ||
        result.status === 'missing_credentials'
      ) {
        accumulator.skipped += 1;
      } else {
        accumulator.failed += 1;
      }

      return accumulator;
    },
    {
      sent: 0,
      duplicate: 0,
      skipped: 0,
      failed: 0,
    },
  );

  return NextResponse.json({
    ok: true,
    pondDate: dayKey,
    subscribers: (data ?? []).length,
    eligible: eligible.length,
    ...summary,
  });
}
