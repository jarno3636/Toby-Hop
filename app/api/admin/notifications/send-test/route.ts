import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin/authorize-admin-request";
import { sendTobyHopNotification } from "@/lib/notifications/send-notification";
import type { TobyHopNotificationType } from "@/lib/notifications/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TestKind =
  | "daily"
  | "rare"
  | "secret"
  | "golden"
  | "rainbow"
  | "starfall"
  | "streak7"
  | "streak30"
  | "streak100"
  | "streak365";

type TestDefinition = {
  type: TobyHopNotificationType;
  title: string;
  body: string;
  targetUrl: string;
};

const TESTS: Record<TestKind, TestDefinition> = {
  daily: {
    type: "daily_hop_reminder",
    title: "The pond misses you 🐸",
    body: "The pond is ready. Make your Toby Hop today.",
    targetUrl: "/",
  },
  rare: {
    type: "seasonal_event",
    title: "A rare discovery ✨",
    body: "Something unusual surfaced in the pond. Open your journal to see it.",
    targetUrl: "/?panel=me",
  },
  secret: {
    type: "seasonal_event",
    title: "The pond revealed a secret",
    body: "A hidden discovery has been added to your Traveler's Journal.",
    targetUrl: "/?panel=me",
  },
  golden: {
    type: "golden_toby",
    title: "Golden Toby appeared ✨",
    body: "A legendary visitor is waiting in today's pond.",
    targetUrl: "/",
  },
  rainbow: {
    type: "rainbow_pond",
    title: "Rainbow Pond is here 🌈",
    body: "Today's pond has changed. Visit before the colors fade.",
    targetUrl: "/",
  },
  starfall: {
    type: "seasonal_event",
    title: "Starfall over the pond ✦",
    body: "A rare sky event is active in Toby Hop today.",
    targetUrl: "/",
  },
  streak7: {
    type: "streak_warning",
    title: "Seven days at the pond",
    body: "Your 7-day streak is alive. One hop keeps the journey going.",
    targetUrl: "/",
  },
  streak30: {
    type: "streak_warning",
    title: "Thirty days at the pond",
    body: "Your 30-day streak is waiting. Return for today's hop.",
    targetUrl: "/",
  },
  streak100: {
    type: "streak_warning",
    title: "One hundred pond days",
    body: "Your 100-day streak is still alive. The pond remembers you.",
    targetUrl: "/",
  },
  streak365: {
    type: "streak_warning",
    title: "A full year of hops",
    body: "Your 365-day journey continues with one more hop today.",
    targetUrl: "/",
  },
};

function isTestKind(value: unknown): value is TestKind {
  return typeof value === "string" && value in TESTS;
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  const { fid } = authorization.admin;

  try {
    const body = (await request.json().catch(() => ({}))) as { kind?: unknown };
    const kind: TestKind = isTestKind(body.kind) ? body.kind : "daily";
    const test = TESTS[kind];

    const result = await sendTobyHopNotification({
      fid,
      type: test.type,
      notificationId: `admin-test:${kind}:${fid}:${Date.now()}`,
      title: test.title,
      body: test.body,
      targetUrl: test.targetUrl,
    });

    return NextResponse.json(
      { ...result, kind },
      {
        status: result.success ? 200 : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Admin test notification failed.", error);

    return NextResponse.json(
      {
        success: false,
        status: "failed",
        error: error instanceof Error ? error.message : "An unexpected error occurred.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
