export const NAV_ITEMS = [
  { href: "/dashboard", key: "nav.dashboard", primary: true },
  { href: "/assets", key: "nav.assets", primary: true },
  { href: "/loans", key: "nav.loans", primary: true },
  { href: "/cashflow", key: "nav.cashflow", primary: true },
  { href: "/repayment", key: "nav.repayment", primary: false },
  { href: "/policies", key: "nav.policies", primary: false },
  { href: "/advisor", key: "nav.advisor", primary: false },
  { href: "/settings", key: "nav.settings", primary: false },
] as const;

// 모바일 하단 탭바에 노출되는 주요 메뉴
export const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => item.primary);

// 모바일 상단 보조 nav에 노출되는 나머지 메뉴 (하단 탭바와 중복되지 않게 분리)
export const SECONDARY_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.primary);

export type NavItem = (typeof NAV_ITEMS)[number];
