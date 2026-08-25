import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/translations";
import { createT } from "@/lib/i18n/t";
import { LOCALE_COOKIE } from "@/lib/i18n/constants";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE;
}

export async function getServerT() {
  const locale = await getLocale();
  return { locale, t: createT(locale) };
}
