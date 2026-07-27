import "server-only";

import { NextResponse } from "next/server";
import { requireFarcasterUser } from "@/lib/auth/require-farcaster-user";
import { isTobyHopAdminFid } from "@/lib/admin/require-toby-hop-admin";

export type AdminRequestResult =
  | {
      authorized: true;
      fid: number;
    }
  | {
      authorized: false;
      response: NextResponse;
    };

export async function verifyAdminRequest(): Promise<AdminRequestResult> {
  try {
    const user = await requireFarcasterUser();
    const fid = Number(user.fid);

    if (!isTobyHopAdminFid(fid)) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: "Not found" },
          { status: 404 },
        ),
      };
    }

    return {
      authorized: true,
      fid,
    };
  } catch {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }
}
