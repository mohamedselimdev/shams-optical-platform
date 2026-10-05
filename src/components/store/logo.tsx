import { getT } from "@/i18n/server";
/** SHAMS wordmark: a sun disc with rays, set beside the Arabic and Latin names. */
export async function Logo({ className = "" }: { className?: string }) {
  const t = await getT();
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <circle cx="16" cy="16" r="7" fill="var(--color-sun-400)" />
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="15" y="1.5" width="2" height="5" rx="1" fill="var(--color-ink)" transform={`rotate(${i * 45} 16 16)`} />
        ))}
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-display text-xl font-bold text-ink">{t("شمس")}</span>
        <span className="text-[10px] font-semibold tracking-[0.3em] text-ink-muted" dir="ltr">SHAMS</span>
      </span>
    </span>
  );
}
