import type { ReactNode } from "react";
import { requireTobyHopAdmin } from "@/lib/admin/require-toby-hop-admin";

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({
  children,
}: AdminLayoutProps) {
  await requireTobyHopAdmin();

  return <>{children}</>;
}
