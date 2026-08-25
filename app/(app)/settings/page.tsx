import { requireUser } from "@/lib/auth";
import { PasswordChangeForm } from "@/components/settings/PasswordChangeForm";
import { DataBackupSection } from "@/components/settings/DataBackupSection";
import { DataDeleteSection } from "@/components/settings/DataDeleteSection";
import { ContextPreviewSection } from "@/components/settings/ContextPreviewSection";
import { PolicyRefreshSection } from "@/components/settings/PolicyRefreshSection";
import { isAdvisorConfigured } from "@/lib/anthropic";
import { getServerT } from "@/lib/i18n/server";

export default async function SettingsPage() {
  const session = await requireUser();
  const { t } = await getServerT();
  const advisorConfigured = isAdvisorConfigured();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("settings.title")}</h1>
        <p className="text-sm text-slate-500">
          {t("settings.subtitle", { name: session.username ?? "" })}
        </p>
      </div>

      <section className="rounded-2xl border border-l-4 border-slate-200 border-l-accent bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">{t("settings.passwordSectionTitle")}</h2>
        <div className="mt-3">
          <PasswordChangeForm />
        </div>
      </section>

      <section className="rounded-2xl border border-l-4 border-slate-200 border-l-sky-500 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">{t("settings.backupSectionTitle")}</h2>
        <p className="mt-1 text-xs text-slate-500">{t("settings.backupDescription")}</p>
        <div className="mt-3">
          <DataBackupSection />
        </div>
      </section>

      <section className="rounded-2xl border border-l-4 border-slate-200 border-l-violet-500 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">
          {t("settings.previewSectionTitle")}
        </h2>
        <p className="mt-1 text-xs text-slate-500">{t("settings.previewDescription")}</p>
        <div className="mt-3">
          <ContextPreviewSection />
        </div>
      </section>

      <section className="rounded-2xl border border-l-4 border-slate-200 border-l-teal-500 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">
          {t("settings.policyRefreshTitle")}
        </h2>
        <p className="mt-1 text-xs text-slate-500">{t("settings.policyRefreshDescription")}</p>
        <div className="mt-3">
          <PolicyRefreshSection configured={advisorConfigured} />
        </div>
      </section>

      <section className="rounded-2xl border border-l-4 border-red-200 border-l-red-500 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-red-700">{t("settings.deleteSectionTitle")}</h2>
        <p className="mt-1 text-xs text-slate-500">{t("settings.deleteDescription")}</p>
        <div className="mt-3">
          <DataDeleteSection />
        </div>
      </section>
    </div>
  );
}
