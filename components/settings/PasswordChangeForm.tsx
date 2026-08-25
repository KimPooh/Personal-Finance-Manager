"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function PasswordChangeForm() {
  const { t } = useLocale();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirm) {
      setError(t("settings.passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("common.saveFailed"));
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch {
      setError(t("common.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <input
        type="password"
        required
        placeholder={t("settings.currentPasswordPlaceholder")}
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        type="password"
        required
        minLength={8}
        placeholder={t("settings.newPasswordPlaceholder")}
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        type="password"
        required
        placeholder={t("settings.confirmPasswordPlaceholder")}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
      {success && <p className="text-sm text-emerald-600 sm:col-span-3">{t("settings.changed")}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50 sm:col-span-3 sm:w-fit"
      >
        {loading ? t("settings.changing") : t("settings.changePassword")}
      </button>
    </form>
  );
}
