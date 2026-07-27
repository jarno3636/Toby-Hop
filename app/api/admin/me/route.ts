import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin/authorize-admin-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization =
    await authorizeAdminRequest(request);

  if (!authorization.authorized) {
    return authorization.response;
  }

  return NextResponse.json(
    {
      success: true,
      admin: {
        fid: authorization.admin.fid,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
