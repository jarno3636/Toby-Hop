import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin/authorize-admin-request";
import { sendTobyHopNotification } from "@/lib/notifications/send-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization =
    await authorizeAdminRequest(request);

  if (!authorization.authorized) {
    return authorization.response;
  }

  const { fid } = authorization.admin;

  try {
    const result =
      await sendTobyHopNotification({
        fid,
        type: "test",
        notificationId:
          `admin-test-${fid}-${Date.now()}`,
        title: "Toby is waiting",
        body:
          "Your pond is ready. Tap here to return to Toby Hop.",
        targetUrl: "/",
      });

    return NextResponse.json(
      result,
      {
        status: result.success ? 200 : 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "Admin test notification failed.",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
