import { redirect } from "next/navigation";
import Link from "next/link";
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
        <div className="mt-6 border-t border-slate-200 pt-5 text-center">
          <p className="text-xs leading-5 text-slate-400">{t("auth.demoDescription")}</p>
          <Link href="/demo" className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">
            {t("auth.demoButton")}
          </Link>
        </div>
      </div>
    </AuthPageChrome>
  );
}
