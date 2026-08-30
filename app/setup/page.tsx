import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SetupForm } from "@/components/auth/SetupForm";
import { getServerT } from "@/lib/i18n/server";
import { AuthPageChrome } from "@/components/auth/AuthPageChrome";

export default async function SetupPage() {
  // app/api/setup/route.ts와 동일한 이유로 production에서는 페이지 자체가 없는
  // 것처럼 404 처리한다 (DB 조회 전에 차단).
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const userCount = await prisma.appUser.count();
  if (userCount > 0) {
    redirect("/login");
  }
  const { t } = await getServerT();

  return (
    <AuthPageChrome>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{t("auth.setupTitle")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("auth.setupDescription")}</p>
        <div className="mt-6">
          <SetupForm />
        </div>
      </div>
    </AuthPageChrome>
  );
}
