import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendTobyHopNotification } from "@/lib/notifications/send-notification";
import { getTodaysPond } from "@/lib/todays-pond";
import { getSeasonalEvent } from "@/lib/toby-core/events/seasonal-calendar";

type ReminderUser = {
  fid: number;
  current_streak: number | null;
  last_hop_day: string | null;
};

export type DailyReminderRunSource = "vercel_cron" | "admin_manual";

export type DailyReminderRunResult = {
  success: true;
  runId: string | null;
  source: DailyReminderRunSource;
  startedAt: string;
  completedAt: string;
  pondDate: string;
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
  duplicate: number;
};

function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function createRun(source: DailyReminderRunSource, startedAt: string): Promise<string | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("toby_hop_cron_runs")
    .insert({
      job_name: "daily-reminders",
      source,
      status: "running",
      started_at: startedAt,
      completed_at: null,
      candidates: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      duplicate_count: 0,
      error_message: null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    console.error("Unable to create cron run log.", error);
    return null;
  }

  return data.id;
}

async function finishRun(
  runId: string | null,
  values: Omit<DailyReminderRunResult, "success" | "runId" | "source" | "startedAt" | "pondDate">,
  errorMessage: string | null = null,
): Promise<void> {
  if (!runId) return;

  const db = supabaseAdmin();
  const { error } = await db
    .from("toby_hop_cron_runs")
    .update({
      status: errorMessage ? "failed" : "completed",
      completed_at: values.completedAt,
      candidates: values.candidates,
      sent: values.sent,
      failed: values.failed,
      skipped: values.skipped,
      duplicate_count: values.duplicate,
      error_message: errorMessage,
    })
    .eq("id", runId);

  if (error) console.error("Unable to finish cron run log.", error);
}

function buildReminder(user: ReminderUser, now: Date) {
  const pond = getTodaysPond(now);
  const seasonal = getSeasonalEvent(now);
  const streak = Math.max(0, user.current_streak ?? 0);
  const pondDate = utcDay(now);

  if (seasonal) {
    return {
      type: "seasonal_event" as const,
      notificationId: `seasonal-reminder:${seasonal.key}:${pondDate}:${user.fid}`,
      title: seasonal.notificationTitle,
      body: seasonal.notificationBody,
    };
  }

  if (pond.goldenToby) {
    return {
      type: "golden_toby" as const,
      notificationId: `golden-pond:${pondDate}:${user.fid}`,
      title: "Golden Toby may appear ✨",
      body: "Today’s pond carries a legendary glow. Make your hop before it fades.",
    };
  }

  if (pond.id === "rainbow") {
    return {
      type: "rainbow_pond" as const,
      notificationId: `rainbow-pond:${pondDate}:${user.fid}`,
      title: "Rainbow Pond is here 🌈",
      body: "Today’s pond has changed. Visit before the colors fade.",
    };
  }

  if (pond.id === "shooting-star") {
    return {
      type: "seasonal_event" as const,
      notificationId: `starfall-pond:${pondDate}:${user.fid}`,
      title: "Starfall over the pond ✦",
      body: "A rare sky event is active in Toby Hop today.",
    };
  }

  return {
    type: streak > 0 ? "streak_warning" as const : "daily_hop_reminder" as const,
    notificationId: `daily-reminder:${pondDate}:${user.fid}`,
    title: pond.curiosityTitle,
    body: streak > 0
      ? `${pond.curiosityBody} Your ${streak}-day trail is still unbroken.`
      : pond.curiosityBody,
  };
}

export async function runDailyReminders(source: DailyReminderRunSource): Promise<DailyReminderRunResult> {
  const now = new Date();
  const startedAt = now.toISOString();
  const pondDate = utcDay(now);
  const runId = await createRun(source, startedAt);

  let candidates = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let duplicate = 0;

  try {
    const db = supabaseAdmin();
    const { data: users, error } = await db
      .from("toby_hop_users")
      .select("fid,current_streak,last_hop_day")
      .eq("notifications_enabled", true)
      .not("notification_url", "is", null)
      .not("notification_token", "is", null)
      .or(`last_hop_day.is.null,last_hop_day.lt.${pondDate}`)
      .limit(1000)
      .returns<ReminderUser[]>();

    if (error) throw error;
    candidates = users?.length ?? 0;

    for (const user of users ?? []) {
      const reminder = buildReminder(user, now);
      const result = await sendTobyHopNotification({
        fid: user.fid,
        type: reminder.type,
        notificationId: reminder.notificationId,
        pondDate,
        title: reminder.title,
        body: reminder.body,
        targetUrl: "/",
      });

      if (result.success) sent += 1;
      else if (result.status === "duplicate") duplicate += 1;
      else if (result.status === "disabled" || result.status === "missing_credentials") skipped += 1;
      else failed += 1;
    }

    const completedAt = new Date().toISOString();
    const result: DailyReminderRunResult = {
      success: true,
      runId,
      source,
      startedAt,
      completedAt,
      pondDate,
      candidates,
      sent,
      failed,
      skipped,
      duplicate,
    };

    await finishRun(runId, result);
    return result;
  } catch (cause) {
    const completedAt = new Date().toISOString();
    const message = cause instanceof Error ? cause.message : "Unable to send reminders.";
    await finishRun(runId, { completedAt, candidates, sent, failed, skipped, duplicate }, message);
    throw cause;
  }
}
