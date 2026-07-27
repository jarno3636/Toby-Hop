import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireTobyHopAdmin } from "@/lib/admin/toby-hop-admin";

export const metadata: Metadata = {
  title: "Toby Hop Admin",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({
  children,
}: AdminLayoutProps) {
  await requireTobyHopAdmin();

  return <>{children}</>;
}
