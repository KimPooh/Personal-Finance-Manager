import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export default async function RootPage() {
  const userCount = await prisma.appUser.count();
  if (userCount === 0) {
    redirect("/setup");
  }

  const session = await getSession();
  if (!session.userId) {
    redirect("/login");
  }

  redirect("/dashboard");
}
