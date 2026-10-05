"use client";

import { useT } from "@/i18n/client";
import { cn } from "./cn";

/**
 * Locale-aware formatting usable from server and client components alike (they render on the server
 * with the request's locale and need no translator prop).
 */
export function Money({ value, className, strike }: { value: number; className?: string; strike?: boolean }) {
  const t = useT();
  return <span className={cn("num whitespace-nowrap", strike && "text-ink-faint line-through", className)}>{t.money(value)}</span>;
}

export function DateText({ value, withTime }: { value: Date | string; withTime?: boolean }) {
  const t = useT();
  const d = typeof value === "string" ? new Date(value) : value;
  return <time dateTime={d.toISOString()}>{t.date(d, withTime)}</time>;
}

export function Num({ value, className }: { value: number; className?: string }) {
  const t = useT();
  return <span className={cn("num", className)}>{t.number(value)}</span>;
}

/** Translates a message string that came from the server or a shared constant. */
export function T({ children, params }: { children: string; params?: Record<string, string | number> }) {
  const t = useT();
  return <>{t(children, params)}</>;
}
