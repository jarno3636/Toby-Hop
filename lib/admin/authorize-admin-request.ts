import "server-only";

import { NextResponse } from "next/server";
import { requireFarcasterUser } from "@/lib/auth/require-farcaster-user";

const ADMIN_FIDS = new Set<number>([1121193]);

export type TobyHopAdmin = {
  fid: number;
};

export type AdminAuthorizationResult =
  | {
      authorized: true;
      admin: TobyHopAdmin;
    }
  | {
      authorized: false;
      response: NextResponse;
    };

function hiddenResponse(status = 404): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: "Not found.",
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export function isTobyHopAdminFid(value: unknown): boolean {
  const fid = Number(value);

  return (
    Number.isSafeInteger(fid) &&
    fid > 0 &&
    ADMIN_FIDS.has(fid)
  );
}

export async function authorizeAdminRequest(
  request: Request,
): Promise<AdminAuthorizationResult> {
  try {
    const user = await requireFarcasterUser(request);

    if (!isTobyHopAdminFid(user.fid)) {
      return {
        authorized: false,
        response: hiddenResponse(404),
      };
    }

    return {
      authorized: true,
      admin: {
        fid: user.fid,
      },
    };
  } catch (error) {
    console.warn("Toby Hop admin authorization rejected.", {
      message:
        error instanceof Error
          ? error.message
          : String(error),
    });

    /*
     * Use 404 instead of 401 so the endpoint does not reveal
     * whether an admin resource exists.
     */
    return {
      authorized: false,
      response: hiddenResponse(404),
    };
  }
}
