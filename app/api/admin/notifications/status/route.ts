import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin/authorize-admin-request";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminUserRow = {
  fid: number;
  notification_url: string | null;
  notification_token: string | null;
  notifications_enabled: boolean | null;
  notifications_updated_at: string | null;
};

type SubscriberPreviewRow = AdminUserRow & {
  current_streak: number | null;
  last_hop_day: string | null;
};

type WebhookRow = {
  event_type: string;
  processed: boolean;
  processing_error: string | null;
  received_at: string;
};

type DeliveryRow = {
  notification_id: string;
  notification_type: string;
  status: string;
  title: string;
  body: string;
  target_url: string;
  attempted_at: string | null;
  delivered_at: string | null;
  created_at: string;
  error_message: string | null;
  provider_response: unknown;
};

type CronRunRow = {
  id: string;
  job_name: string;
  source: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
  duplicate_count: number;
  error_message: string | null;
};

function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 12) return "••••••••";
  return `${value.slice(0, 6)}••••••${value.slice(-4)}`;
}

function maskNotificationUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.pathname}`;
  } catch {
    return "Invalid saved URL";
  }
}

function normalizePublicAppUrl(): string | null {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? null;
  return rawUrl ? rawUrl.replace(/\/+$/, "") : null;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function classifySubscriber(row: SubscriberPreviewRow, pondDate: string) {
  const enabled = Boolean(row.notifications_enabled);
  const hasUrl = Boolean(row.notification_url?.trim());
  const hasToken = Boolean(row.notification_token?.trim());
  const hoppedToday = row.last_hop_day === pondDate;

  let status: "eligible" | "already_hopped" | "missing_credentials" | "disabled";
  let reason: string;

  if (!enabled) {
    status = "disabled";
    reason = "Notifications disabled";
  } else if (!hasUrl || !hasToken) {
    status = "missing_credentials";
    reason = !hasUrl && !hasToken ? "Missing URL and token" : !hasUrl ? "Missing notification URL" : "Missing notification token";
  } else if (hoppedToday) {
    status = "already_hopped";
    reason = "Already hopped today";
  } else {
    status = "eligible";
    reason = "Eligible for today's reminder";
  }

  return {
    fid: row.fid,
    status,
    reason,
    enabled,
    hasNotificationUrl: hasUrl,
    hasNotificationToken: hasToken,
    lastHopDay: row.last_hop_day,
    currentStreak: Math.max(0, row.current_streak ?? 0),
    updatedAt: row.notifications_updated_at,
  };
}

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  const { fid } = authorization.admin;
  const supabase = supabaseAdmin();
  const pondDate = utcDay();

  const [
    userResult,
    webhookResult,
    deliveriesResult,
    totalCountResult,
    enabledCountResult,
    credentialCountResult,
    hoppedTodayCountResult,
    eligibleCountResult,
    previewResult,
    cronResult,
  ] = await Promise.all([
    supabase
      .from("toby_hop_users")
      .select("fid,notification_url,notification_token,notifications_enabled,notifications_updated_at")
      .eq("fid", fid)
      .maybeSingle<AdminUserRow>(),
    supabase
      .from("toby_hop_webhook_events")
      .select("event_type,processed,processing_error,received_at")
      .eq("fid", fid)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle<WebhookRow>(),
    supabase
      .from("toby_hop_notification_deliveries")
      .select("notification_id,notification_type,status,title,body,target_url,attempted_at,delivered_at,created_at,error_message,provider_response")
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<DeliveryRow[]>(),
    supabase.from("toby_hop_users").select("fid", { count: "exact", head: true }),
    supabase.from("toby_hop_users").select("fid", { count: "exact", head: true }).eq("notifications_enabled", true),
    supabase
      .from("toby_hop_users")
      .select("fid", { count: "exact", head: true })
      .eq("notifications_enabled", true)
      .not("notification_url", "is", null)
      .not("notification_token", "is", null),
    supabase
      .from("toby_hop_users")
      .select("fid", { count: "exact", head: true })
      .eq("notifications_enabled", true)
      .not("notification_url", "is", null)
      .not("notification_token", "is", null)
      .eq("last_hop_day", pondDate),
    supabase
      .from("toby_hop_users")
      .select("fid", { count: "exact", head: true })
      .eq("notifications_enabled", true)
      .not("notification_url", "is", null)
      .not("notification_token", "is", null)
      .or(`last_hop_day.is.null,last_hop_day.lt.${pondDate}`),
    supabase
      .from("toby_hop_users")
      .select("fid,notification_url,notification_token,notifications_enabled,notifications_updated_at,current_streak,last_hop_day")
      .order("notifications_updated_at", { ascending: false, nullsFirst: false })
      .limit(50)
      .returns<SubscriberPreviewRow[]>(),
    supabase
      .from("toby_hop_cron_runs")
      .select("id,job_name,source,status,started_at,completed_at,candidates,sent,failed,skipped,duplicate_count,error_message")
      .eq("job_name", "daily-reminders")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<CronRunRow>(),
  ]);

  if (userResult.error) {
    return NextResponse.json(
      { success: false, error: "Failed to load notification account status." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const optionalErrors = [
    webhookResult.error,
    deliveriesResult.error,
    totalCountResult.error,
    enabledCountResult.error,
    credentialCountResult.error,
    hoppedTodayCountResult.error,
    eligibleCountResult.error,
    previewResult.error,
  ].filter(Boolean);
  if (optionalErrors.length) console.error("Some admin notification status queries failed.", optionalErrors);
  if (cronResult.error && cronResult.error.code !== "42P01") console.error("Failed to load cron run.", cronResult.error);

  const user = userResult.data;
  const appUrl = normalizePublicAppUrl();
  const deliveries = deliveriesResult.data ?? [];
  const totalRegistered = totalCountResult.count ?? 0;
  const enabled = enabledCountResult.count ?? 0;
  const withCredentials = credentialCountResult.count ?? 0;
  const alreadyHoppedToday = hoppedTodayCountResult.count ?? 0;
  const eligibleToday = eligibleCountResult.count ?? 0;

  return NextResponse.json(
    {
      success: true,
      adminFid: fid,
      environment: {
        appUrl,
        webhookUrl: appUrl ? `${appUrl}/api/webhook` : null,
        audience: process.env.FARCASTER_JWT_AUDIENCE ?? null,
        cronSecretConfigured: Boolean(process.env.CRON_SECRET),
        cronPath: "/api/cron/daily-reminders",
        cronSchedule: "0 22 * * *",
      },
      notificationUser: user
        ? {
            fid: user.fid,
            enabled: Boolean(user.notifications_enabled),
            notificationUrl: maskNotificationUrl(user.notification_url),
            tokenPreview: maskSecret(user.notification_token),
            hasNotificationUrl: Boolean(user.notification_url?.trim()),
            hasNotificationToken: Boolean(user.notification_token?.trim()),
            updatedAt: user.notifications_updated_at,
          }
        : null,
      enabledUserCount: enabled,
      subscriberStats: {
        pondDate,
        totalRegistered,
        enabled,
        disabled: Math.max(0, totalRegistered - enabled),
        withCredentials,
        missingCredentials: Math.max(0, enabled - withCredentials),
        alreadyHoppedToday,
        eligibleToday,
      },
      candidatePreview: (previewResult.data ?? []).map((row) => classifySubscriber(row, pondDate)),
      lastWebhook: webhookResult.data ?? null,
      lastDelivery: deliveries[0] ?? null,
      recentDeliveries: deliveries,
      lastCronRun: cronResult.data ?? null,
      cronLoggingReady: !cronResult.error,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
