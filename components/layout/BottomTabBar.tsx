"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV_ITEMS } from "@/lib/nav";
import { useLocale } from "@/lib/i18n/LocaleProvider";

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

function AssetsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.2" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LoansIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <path d="M12 2.5 21 8H3l9-5.5Z" />
      <rect x="4.2" y="10" width="2.3" height="7.5" />
      <rect x="10.85" y="10" width="2.3" height="7.5" />
      <rect x="17.5" y="10" width="2.3" height="7.5" />
      <rect x="3" y="19" width="18" height="2" rx="0.6" />
    </svg>
  );
}

function CashflowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8h13M13.5 4.5 17 8l-3.5 3.5" />
      <path d="M20 16H7M10.5 12.5 7 16l3.5 3.5" />
    </svg>
  );
}

function TabIcon({ href }: { href: string }) {
  switch (href) {
    case "/dashboard":
      return <DashboardIcon />;
    case "/assets":
      return <AssetsIcon />;
    case "/loans":
      return <LoansIcon />;
    case "/cashflow":
      return <CashflowIcon />;
    default:
      return null;
  }
}

export function BottomTabBar() {
  const pathname = usePathname();
  const { t } = useLocale();

  return (
    <nav
      aria-label={t("nav.appName")}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {PRIMARY_NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium ${
              active ? "text-accent" : "text-slate-500"
            }`}
          >
            <TabIcon href={item.href} />
            <span>{t(item.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
