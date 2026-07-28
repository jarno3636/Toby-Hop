import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin/authorize-admin-request";
import { runDailyReminders } from "@/lib/notifications/run-daily-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  try {
    const result = await runDailyReminders("admin_manual");
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    return NextResponse.json(
      {
        success: false,
        error: cause instanceof Error ? cause.message : "Unable to run reminders.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
