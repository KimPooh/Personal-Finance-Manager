"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatUI({ initialMessages }: { initialMessages: ChatMessageItem[] }) {
  const router = useRouter();
  const { t } = useLocale();
  const [messages, setMessages] = useState<ChatMessageItem[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const SAMPLE_QUESTIONS = [
    t("advisor.sample1"),
    t("advisor.sample2"),
    t("advisor.sample3"),
    t("advisor.sample4"),
  ];

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: trimmed }]);
    setLoading(true);

    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("common.saveFailed"));
        return;
      }
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}-a`, role: "assistant", content: data.reply },
      ]);
    } catch {
      setError(t("common.networkError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (!confirm(t("advisor.confirmClear"))) return;
    await fetch("/api/advisor", { method: "DELETE" });
    setMessages([]);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-medium text-slate-500">{t("advisor.sampleQuestionsLabel")}</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-[300px] flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-accent text-accent-foreground"
                : "mr-auto bg-slate-100 text-slate-800"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && <div className="mr-auto text-xs text-slate-400">{t("advisor.generating")}</div>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("advisor.inputPlaceholder")}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {t("advisor.send")}
        </button>
      </form>

      {messages.length > 0 && (
        <button onClick={handleClear} className="self-start text-xs text-slate-400 hover:text-red-600">
          {t("advisor.clearHistory")}
        </button>
      )}

      <p className="text-xs text-slate-400">{t("advisor.footerDisclaimer")}</p>
    </div>
  );
}
