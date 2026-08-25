import { prisma } from "@/lib/db";
import { decryptText } from "@/lib/crypto";
import { isAdvisorConfigured } from "@/lib/anthropic";
import { ChatUI } from "@/components/advisor/ChatUI";
import { getServerT } from "@/lib/i18n/server";

export default async function AdvisorPage() {
  const { t } = await getServerT();
  const configured = isAdvisorConfigured();

  const messages = configured
    ? (await prisma.chatMessage.findMany({ orderBy: { createdAt: "asc" } })).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: decryptText(m.contentEnc),
      }))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("advisor.title")}</h1>
        <p className="text-sm text-slate-500">{t("advisor.subtitle")}</p>
      </div>

      {!configured ? (
        <div className="rounded-2xl border border-l-4 border-sky-200 border-l-sky-500 bg-sky-50 p-6 text-sm text-sky-800">
          <p className="font-semibold text-sky-900">{t("advisor.notConfiguredTitle")}</p>
          <p className="mt-2">{t("advisor.notConfiguredBody")}</p>
        </div>
      ) : (
        <ChatUI initialMessages={messages} />
      )}
    </div>
  );
}
