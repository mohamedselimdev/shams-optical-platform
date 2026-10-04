import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back ? (
          <Link href={back.href} className="mb-1 inline-block text-xs text-ink-muted hover:text-ink">
            → {back.label}
          </Link>
        ) : null}
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
