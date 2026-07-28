import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin/authorize-admin-request";
import { sendTobyHopNotification } from "@/lib/notifications/send-notification";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  SendTobyHopNotificationResult,
  TobyHopNotificationType,
} from "@/lib/notifications/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SUBSCRIBERS_PER_REQUEST = 1_000;
const SEND_BATCH_SIZE = 10;

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

type TestAudience = "me" | "specific" | "subscribers";

type TestDefinition = {
  type: TobyHopNotificationType;
  title: string;
  body: string;
  targetUrl: string;
};

type RequestBody = {
  kind?: unknown;
  audience?: unknown;
  targetFid?: unknown;
  preview?: unknown;
};

type SubscriberRow = {
  fid: number;
};

type RecipientResult = {
  fid: number;
  success: boolean;
  status: SendTobyHopNotificationResult["status"] | "exception";
  notificationId?: string;
  error?: string;
};

const TESTS: Record<TestKind, TestDefinition> = {
  daily: {
    type: "daily_hop_reminder",
    title: "The pond misses you 🐸",
    body: "The pond is ready. Make your Toby Hop today.",
    targetUrl: "/",
  },
  rare: {
    type: "rare_discovery",
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
    type: "streak_milestone",
    title: "Seven days at the pond",
    body: "Your 7-day streak is alive. One hop keeps the journey going.",
    targetUrl: "/",
  },
  streak30: {
    type: "streak_milestone",
    title: "Thirty days at the pond",
    body: "Your 30-day streak is waiting. Return for today's hop.",
    targetUrl: "/",
  },
  streak100: {
    type: "streak_milestone",
    title: "One hundred pond days",
    body: "Your 100-day streak is still alive. The pond remembers you.",
    targetUrl: "/",
  },
  streak365: {
    type: "streak_milestone",
    title: "A full year of hops",
    body: "Your 365-day journey continues with one more hop today.",
    targetUrl: "/",
  },
};

function isTestKind(value: unknown): value is TestKind {
  return typeof value === "string" && value in TESTS;
}

function isTestAudience(value: unknown): value is TestAudience {
  return value === "me" || value === "specific" || value === "subscribers";
}

function parsePositiveFid(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isPreview(value: unknown): boolean {
  return value === true;
}

async function loadSubscriberFids(): Promise<number[]> {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("toby_hop_users")
    .select("fid")
    .eq("notifications_enabled", true)
    .not("notification_url", "is", null)
    .not("notification_token", "is", null)
    .order("fid", { ascending: true })
    .limit(MAX_SUBSCRIBERS_PER_REQUEST)
    .returns<SubscriberRow[]>();

  if (error) {
    throw new Error(`Failed to load notification subscribers: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => row.fid)
    .filter((fid) => Number.isSafeInteger(fid) && fid > 0);
}

async function sendInBatches(
  fids: number[],
  kind: TestKind,
  test: TestDefinition,
): Promise<RecipientResult[]> {
  const results: RecipientResult[] = [];
  const runId = Date.now();

  for (let index = 0; index < fids.length; index += SEND_BATCH_SIZE) {
    const batch = fids.slice(index, index + SEND_BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (fid): Promise<RecipientResult> => {
        try {
          const result = await sendTobyHopNotification({
            fid,
            type: test.type,
            notificationId: `admin-test:${kind}:${fid}:${runId}`,
            title: test.title,
            body: test.body,
            targetUrl: test.targetUrl,
          });

          return {
            fid,
            success: result.success,
            status: result.status,
            notificationId: result.notificationId,
            error: result.success ? undefined : result.error,
          };
        } catch (error) {
          return {
            fid,
            success: false,
            status: "exception",
            error:
              error instanceof Error
                ? error.message
                : "An unexpected error occurred.",
          };
        }
      }),
    );

    results.push(...batchResults);
  }

  return results;
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.authorized) return authorization.response;

  const { fid: adminFid } = authorization.admin;

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const kind: TestKind = isTestKind(body.kind) ? body.kind : "daily";
    const audience: TestAudience = isTestAudience(body.audience)
      ? body.audience
      : "me";
    const preview = isPreview(body.preview);
    const test = TESTS[kind];

    let recipientFids: number[];

    if (audience === "me") {
      recipientFids = [adminFid];
    } else if (audience === "specific") {
      const targetFid = parsePositiveFid(body.targetFid);

      if (!targetFid) {
        return NextResponse.json(
          {
            success: false,
            status: "invalid_request",
            error: "A valid positive targetFid is required for the specific audience.",
          },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }

      recipientFids = [targetFid];
    } else {
      recipientFids = await loadSubscriberFids();
    }

    if (preview) {
      return NextResponse.json(
        {
          success: true,
          status: "preview",
          kind,
          audience,
          recipientCount: recipientFids.length,
          capped: audience === "subscribers" && recipientFids.length >= MAX_SUBSCRIBERS_PER_REQUEST,
          maxRecipients: MAX_SUBSCRIBERS_PER_REQUEST,
          recipients: audience === "subscribers" ? recipientFids.slice(0, 100) : recipientFids,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (recipientFids.length === 0) {
      return NextResponse.json(
        {
          success: true,
          status: "no_recipients",
          kind,
          audience,
          recipientCount: 0,
          sent: 0,
          failed: 0,
          results: [],
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    const results = await sendInBatches(recipientFids, kind, test);
    const sent = results.filter((result) => result.success).length;
    const failed = results.length - sent;

    if (audience !== "subscribers") {
      const result = results[0];

      return NextResponse.json(
        {
          ...result,
          kind,
          audience,
          recipientCount: 1,
          sent,
          failed,
        },
        {
          status: result.success ? 200 : 400,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      {
        success: failed === 0,
        status: failed === 0 ? "sent" : sent > 0 ? "partial" : "failed",
        kind,
        audience,
        recipientCount: results.length,
        sent,
        failed,
        capped: recipientFids.length >= MAX_SUBSCRIBERS_PER_REQUEST,
        maxRecipients: MAX_SUBSCRIBERS_PER_REQUEST,
        results,
      },
      {
        status: sent > 0 || results.length === 0 ? 200 : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Admin test notification failed.", error);

    return NextResponse.json(
      {
        success: false,
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
