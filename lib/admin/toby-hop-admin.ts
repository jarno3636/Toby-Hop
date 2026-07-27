import "server-only";

import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireFarcasterUser } from "@/lib/auth/require-farcaster-user";

export const TOBY_HOP_ADMIN_FID = 1121193;

type FarcasterUserLike = {
  fid: number | string;
};

export type TobyHopAdmin = {
  fid: number;
};

function parseFid(value: unknown): number | null {
  const fid = Number(value);

  if (!Number.isSafeInteger(fid) || fid <= 0) {
    return null;
  }

  return fid;
}

export function isTobyHopAdminFid(value: unknown): boolean {
  return parseFid(value) === TOBY_HOP_ADMIN_FID;
}

/**
 * Protects server-rendered pages.
 *
 * Unauthorized users receive a 404 so the admin route is not advertised.
 */
export async function requireTobyHopAdmin(): Promise<TobyHopAdmin> {
  try {
    const user = (await requireFarcasterUser()) as FarcasterUserLike;
    const fid = parseFid(user.fid);

    if (fid !== TOBY_HOP_ADMIN_FID) {
      notFound();
    }

    return { fid };
  } catch {
    notFound();
  }
}

/**
 * Protects API routes independently from the page layout.
 */
export async function authorizeTobyHopAdminApi(): Promise<
  | {
      authorized: true;
      admin: TobyHopAdmin;
    }
  | {
      authorized: false;
      response: NextResponse;
    }
> {
  try {
    const user = (await requireFarcasterUser()) as FarcasterUserLike;
    const fid = parseFid(user.fid);

    if (fid !== TOBY_HOP_ADMIN_FID) {
      return {
        authorized: false,
        response: NextResponse.json(
          {
            success: false,
            error: "Not found",
          },
          {
            status: 404,
            headers: {
              "Cache-Control": "no-store",
            },
          },
        ),
      };
    }

    return {
      authorized: true,
      admin: { fid },
    };
  } catch {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      ),
    };
  }
}
