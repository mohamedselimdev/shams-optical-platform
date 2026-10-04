"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * First-party analytics client. Nothing is sent until the shopper consents (when consent is required);
 * events go to our own endpoint only. Prescription values and personal data are never included.
 */
const CONSENT_COOKIE = "shams_consent";

function readConsent(): "granted" | "denied" | null {
  const m = document.cookie.match(/(?:^|; )shams_consent=(granted|denied)/);
  return (m?.[1] as "granted" | "denied" | undefined) ?? null;
}

let enabled = false;

type EventInput = { name: string; productId?: string; variantId?: string; branchId?: string; value?: number; props?: Record<string, string | number | boolean> };

export function track(event: EventInput) {
  if (!enabled) return;
  const params = new URLSearchParams(window.location.search);
  const utm = Object.fromEntries(["source", "medium", "campaign", "term", "content"].map((k) => [k, params.get(`utm_${k}`) ?? undefined]).filter(([, v]) => v));
  const body = JSON.stringify({ ...event, path: window.location.pathname, referrer: document.referrer || undefined, utm: Object.keys(utm).length ? utm : undefined });
  try {
    fetch("/api/analytics/collect", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    /* analytics must never break the page */
  }
}

export function Analytics({ active, requireConsent }: { active: boolean; requireConsent: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [consent, setConsent] = useState<"granted" | "denied" | null | "unknown">("unknown");

  useEffect(() => setConsent(readConsent()), []);
  enabled = active && (!requireConsent || consent === "granted");

  useEffect(() => {
    if (enabled) track({ name: "page_view" });
  }, [pathname, search, consent]);

  if (!active || !requireConsent || consent !== null) return null;
  const choose = (v: "granted" | "denied") => {
    document.cookie = `${CONSENT_COOKIE}=${v}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setConsent(v);
  };
  return (
    <div role="dialog" aria-live="polite" aria-label="ملفات تعريف الارتباط" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-lg border border-line bg-surface p-4 shadow-pop sm:inset-x-auto sm:end-4">
      <p className="text-sm text-ink-soft">نستخدم ملفات تعريف ارتباط أساسية لتشغيل السلة وتسجيل الدخول. بموافقتك نستخدم أيضاً إحصاءات داخلية مجهولة لتحسين المتجر، ولا نشاركها مع أي طرف خارجي.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => choose("granted")} className="h-9 rounded-md bg-ink px-4 text-sm font-medium text-surface">موافق</button>
        <button type="button" onClick={() => choose("denied")} className="h-9 rounded-md border border-line-strong px-4 text-sm">الأساسية فقط</button>
      </div>
    </div>
  );
}
