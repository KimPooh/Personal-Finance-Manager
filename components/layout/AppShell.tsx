"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV_ITEMS, SECONDARY_NAV_ITEMS, type NavItem } from "@/lib/nav";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LanguageToggle } from "@/components/theme/LanguageToggle";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import type { TFunction } from "@/lib/i18n/t";

function NavLink({
  item,
  active,
  t,
}: {
  item: NavItem;
  active: boolean;
  t: TFunction;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {t(item.key)}
    </Link>
  );
}

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

        {/* 모바일: 하단 탭바에 없는 나머지 메뉴만 (중복 방지) */}
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:hidden">
          {SECONDARY_NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} t={t} />
          ))}
        </nav>

        {/* 데스크톱: 전체 메뉴 */}
        <nav className="hidden md:flex md:flex-col md:gap-1 md:px-2">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} t={t} />
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="w-full px-4 py-3 text-left text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          {t("common.logout")}
        </button>
      </aside>
      <main className="flex-1 bg-slate-50 px-4 pt-6 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:px-8 md:py-8">
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
}
