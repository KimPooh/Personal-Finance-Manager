"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // next-themes 권장 패턴: 서버/클라이언트 렌더링 불일치(hydration mismatch)를
    // 막기 위해 마운트 이후에만 실제 테마 상태를 반영합니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-16 rounded-full bg-slate-100" aria-hidden />;
  }

  const isDark = (theme === "system" ? resolvedTheme : theme) === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="테마 전환"
      className="flex h-8 w-16 items-center rounded-full border border-slate-300 bg-slate-100 px-1 transition"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs shadow-sm transition-transform ${
          isDark ? "translate-x-8" : "translate-x-0"
        }`}
      >
        {isDark ? "🌙" : "☀️"}
      </span>
    </button>
  );
}
