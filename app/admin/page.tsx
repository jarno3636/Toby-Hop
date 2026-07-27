import { requireTobyHopAdmin } from "@/lib/admin/toby-hop-admin";
import { AdminNotificationsClient } from "./AdminNotificationsClient";

export const dynamic = "force-dynamic";

export default async function TobyHopAdminPage() {
  const admin = await requireTobyHopAdmin();

  return <AdminNotificationsClient adminFid={admin.fid} />;
}
