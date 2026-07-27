import "server-only";

import { notFound } from "next/navigation";
import { requireFarcasterUser } from "@/lib/auth/require-farcaster-user";

const ADMIN_FIDS = new Set<number>([1121193]);

export type TobyHopAdmin = {
  fid: number;
};

export async function requireTobyHopAdmin(): Promise<TobyHopAdmin> {
  const user = await requireFarcasterUser();

  const fid = Number(user.fid);

  if (!Number.isSafeInteger(fid) || fid <= 0 || !ADMIN_FIDS.has(fid)) {
    // Return a 404 instead of revealing that an admin page exists.
    notFound();
  }

  return { fid };
}

export function isTobyHopAdminFid(fid: unknown): boolean {
  const parsedFid = Number(fid);

  return (
    Number.isSafeInteger(parsedFid) &&
    parsedFid > 0 &&
    ADMIN_FIDS.has(parsedFid)
  );
}
