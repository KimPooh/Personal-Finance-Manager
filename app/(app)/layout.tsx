import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();

  return <AppShell username={session.username ?? ""}>{children}</AppShell>;
}
