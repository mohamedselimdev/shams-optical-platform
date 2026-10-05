"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore, useTransition } from "react";
import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { LOCALE_COOKIE, THEME_COOKIE, isTheme, type Theme } from "@/i18n/config";
import { useT } from "@/i18n/client";
import { cn } from "@/ui/cn";

const YEAR = 60 * 60 * 24 * 365;
function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${YEAR}; SameSite=Lax`;
}

function readTheme(): Theme {
  const v = document.documentElement.dataset.theme;
  return isTheme(v) ? v : "system";
}
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Switches the interface language. The server re-renders with the new locale. */
export function LanguageSwitch({ className }: { className?: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = t.locale === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setCookie(LOCALE_COOKIE, next);
        start(() => router.refresh());
      }}
      className={cn("inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-surface-2 disabled:opacity-60", className)}
      aria-label={t("تغيير اللغة")}
      lang={next}
    >
      <Languages className="h-4 w-4" aria-hidden />
      <span>{next === "en" ? "English" : "العربية"}</span>
    </button>
  );
}

const ORDER: Theme[] = ["system", "light", "dark"];

/** Cycles system → light → dark. Applied instantly on <html>; the cookie keeps it for the next request. */
export function ThemeSwitch({ className }: { className?: string }) {
  const t = useT();
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const label = { system: t("مظهر النظام"), light: t("الوضع الفاتح"), dark: t("الوضع الداكن") }[theme];
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => {
        if (next === "system") delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = next;
        setCookie(THEME_COOKIE, next);
        listeners.forEach((l) => l());
      }}
      className={cn("inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-2", className)}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
