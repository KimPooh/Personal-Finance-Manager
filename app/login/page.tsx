import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { LoginForm } from "@/components/auth/LoginForm";
import { getServerT } from "@/lib/i18n/server";
import { AuthPageChrome } from "@/components/auth/AuthPageChrome";

export default async function LoginPage() {
  const userCount = await prisma.appUser.count();
  if (userCount === 0) {
    redirect("/setup");
  }

  const session = await getSession();
  if (session.userId) {
    redirect("/dashboard");
  }

  const { t } = await getServerT();

  return (
    <AuthPageChrome>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{t("auth.loginTitle")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("auth.loginDescription")}</p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </AuthPageChrome>
  );
}
