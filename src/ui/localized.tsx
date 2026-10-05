"use client";

import Link from "next/link";
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

export function PaginationNav({ page, links, prev, next }: { page: number; links: { page: number; href: string }[]; prev: string | null; next: string | null }) {
  const t = useT();
  return (
    <nav aria-label={t("الصفحات")} className="mt-6 flex flex-wrap items-center justify-center gap-1">
      {prev ? <Link className="rounded-md px-3 py-1.5 text-sm hover:bg-surface-2" href={prev} rel="prev">{t("السابق")}</Link> : null}
      {links.map((l, i) => (
        <span key={l.page} className="flex items-center">
          {i > 0 && l.page - links[i - 1].page > 1 ? <span className="px-1 text-ink-faint">…</span> : null}
          <Link href={l.href} aria-current={l.page === page ? "page" : undefined} className={cn("num min-w-9 rounded-md px-3 py-1.5 text-center text-sm", l.page === page ? "bg-ink text-surface" : "hover:bg-surface-2")}>
            {t.number(l.page)}
          </Link>
        </span>
      ))}
      {next ? <Link className="rounded-md px-3 py-1.5 text-sm hover:bg-surface-2" href={next} rel="next">{t("التالي")}</Link> : null}
    </nav>
  );
}
