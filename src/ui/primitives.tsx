import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";
import { Num } from "./localized";

const tones = {
  neutral: "bg-surface-2 text-ink-soft border-line",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  info: "bg-info-soft text-info border-info/20",
  sun: "bg-sun-100 text-sun-800 border-sun-200",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface shadow-card", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export { Money, DateText, Num, T } from "./localized";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <div className="mb-3 h-10 w-10 rounded-full bg-sun-100" aria-hidden />
      <p className="font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Builds pagination links that preserve the current query string. */
export function Pagination({ page, pageCount, basePath, params }: { page: number; pageCount: number; basePath: string; params: Record<string, string | undefined> }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2);
  return (
    <nav aria-label="الصفحات" className="mt-6 flex flex-wrap items-center justify-center gap-1">
      {page > 1 ? <Link className="rounded-md px-3 py-1.5 text-sm hover:bg-surface-2" href={href(page - 1)} rel="prev">السابق</Link> : null}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && p - pages[i - 1] > 1 ? <span className="px-1 text-ink-faint">…</span> : null}
          <Link href={href(p)} aria-current={p === page ? "page" : undefined} className={cn("num min-w-9 rounded-md px-3 py-1.5 text-center text-sm", p === page ? "bg-ink text-surface" : "hover:bg-surface-2")}>
            <Num value={p} />
          </Link>
        </span>
      ))}
      {page < pageCount ? <Link className="rounded-md px-3 py-1.5 text-sm hover:bg-surface-2" href={href(page + 1)} rel="next">التالي</Link> : null}
    </nav>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("border-b border-line bg-surface-2/60 px-4 py-2.5 text-start text-xs font-semibold text-ink-muted", className)}>{children}</th>;
}
export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle", className)} {...props} />;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="num mt-1.5 font-display text-2xl font-semibold text-ink">{value}</p>
      {hint ? <p className={cn("mt-1 text-xs", tone === "down" ? "text-danger" : tone === "up" ? "text-success" : "text-ink-muted")}>{hint}</p> : null}
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map((it, i) => (
        <div key={i} className="flex flex-col">
          <dt className="text-xs text-ink-muted">{it.label}</dt>
          <dd className="mt-0.5 text-ink">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
