"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LanguageToggle } from "@/components/theme/LanguageToggle";

export function AppShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white md:w-56 md:flex-shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:flex-col md:items-start md:gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{t("nav.appName")}</p>
            <p className="text-xs text-slate-400">{t("nav.greeting", { name: username })}</p>
          </div>
          <div className="flex items-center gap-2 md:w-full md:justify-between">
            <ThemeToggle />
            <LanguageToggle />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:px-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={handleLogout}
          className="w-full px-4 py-3 text-left text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          {t("common.logout")}
        </button>
      </aside>
      <main className="flex-1 bg-slate-50 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
