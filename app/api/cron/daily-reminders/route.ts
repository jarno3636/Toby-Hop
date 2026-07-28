import { NextResponse } from "next/server";
import { runDailyReminders } from "@/lib/notifications/run-daily-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expectedSecret || authorization !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runDailyReminders("vercel_cron");
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    return NextResponse.json(
      {
        success: false,
        error: cause instanceof Error ? cause.message : "Unable to send reminders.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
