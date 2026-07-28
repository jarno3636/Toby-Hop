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

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  const { fid } = authorization.admin;
  const supabase = supabaseAdmin();

  const [userResult, webhookResult, deliveriesResult, enabledCountResult, cronResult] =
    await Promise.all([
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
        .eq("fid", fid)
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<DeliveryRow[]>(),
      supabase
        .from("toby_hop_users")
        .select("fid", { count: "exact", head: true })
        .eq("notifications_enabled", true),
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

  if (webhookResult.error) console.error("Failed to load webhook event.", webhookResult.error);
  if (deliveriesResult.error) console.error("Failed to load deliveries.", deliveriesResult.error);
  if (enabledCountResult.error) console.error("Failed to count users.", enabledCountResult.error);
  if (cronResult.error && cronResult.error.code !== "42P01") {
    console.error("Failed to load cron run.", cronResult.error);
  }

  const user = userResult.data;
  const appUrl = normalizePublicAppUrl();
  const deliveries = deliveriesResult.data ?? [];

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
      enabledUserCount: enabledCountResult.count ?? 0,
      lastWebhook: webhookResult.data ?? null,
      lastDelivery: deliveries[0] ?? null,
      recentDeliveries: deliveries,
      lastCronRun: cronResult.data ?? null,
      cronLoggingReady: !cronResult.error,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
