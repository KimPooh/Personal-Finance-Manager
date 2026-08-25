import { translations, type Locale } from "@/lib/i18n/translations";

type Vars = Record<string, string | number>;

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  );
}

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const value = getPath(translations[locale], key);
  if (typeof value === "string") return interpolate(value, vars);
  return key;
}

export type TFunction = (key: string, vars?: Vars) => string;

export function createT(locale: Locale): TFunction {
  return (key: string, vars?: Vars) => translate(locale, key, vars);
}
