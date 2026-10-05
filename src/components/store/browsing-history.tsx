"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProductCard as Card } from "@/modules/catalog/queries";
import { ProductGrid } from "./product-card";
import { track } from "./analytics";
import { useT } from "@/i18n/client";

/**
 * Recently viewed and compare lists live in this browser only (localStorage): they hold public
 * product ids, nothing personal, and need no account.
 */
const RECENT = "shams_recent";
const COMPARE = "shams_compare";
const MAX_COMPARE = 4;

function read(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && /^[a-z0-9]{10,40}$/i.test(x)) : [];
  } catch {
    return [];
  }
}
function write(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export function RememberProduct({ id }: { id: string }) {
  useEffect(() => {
    write(RECENT, [id, ...read(RECENT).filter((x) => x !== id)].slice(0, 12));
  }, [id]);
  return null;
}

export function RecentlyViewed({ exclude }: { exclude?: string }) {
  const t = useT();
  const [items, setItems] = useState<Card[]>([]);
  useEffect(() => {
    const ids = read(RECENT).filter((x) => x !== exclude).slice(0, 4);
    if (!ids.length) return;
    fetch(`/api/catalog/cards?ids=${ids.join(",")}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Card[]) => setItems(data))
      .catch(() => {});
  }, [exclude]);
  if (!items.length) return null;
  return (
    <section className="mt-16" aria-labelledby="recent-title">
      <h2 id="recent-title" className="mb-6 font-display text-2xl font-semibold">{t("شاهدتها مؤخراً")}</h2>
      <ProductGrid products={items} />
    </section>
  );
}

const compareListeners = new Set<() => void>();
const subscribeCompare = (cb: () => void) => {
  compareListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    compareListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};
// Snapshot must be referentially stable between reads: return the raw string.
const compareSnapshot = () => {
  try {
    return localStorage.getItem(COMPARE) ?? "[]";
  } catch {
    return "[]";
  }
};

export function CompareButton({ id }: { id: string }) {
  const t = useT();
  const raw = useSyncExternalStore(subscribeCompare, compareSnapshot, () => null);
  if (raw === null) return null;
  const list = read(COMPARE);
  const inList = list.includes(id);
  const toggle = () => {
    const next = inList ? list.filter((x) => x !== id) : [...list, id].slice(-MAX_COMPARE);
    write(COMPARE, next);
    compareListeners.forEach((l) => l());
    if (!inList) track({ name: "compare_add", productId: id });
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={toggle} aria-pressed={inList} className="inline-flex h-8 items-center rounded-md border border-line-strong px-3 text-sm hover:border-ink">
        {inList ? t("✓ في المقارنة") : t("أضف للمقارنة")}
      </button>
      {list.length > 1 ? <Link href={`/compare?ids=${list.join(",")}`} className="text-sm text-sun-700 underline">{t("قارن ({0})", [list.length])}</Link> : null}
    </span>
  );
}

export function ClearCompare() {
  const t = useT();
  const router = useRouter();
  return (
    <button type="button" onClick={() => { write(COMPARE, []); router.push("/shop"); }} className="text-sm text-ink-muted underline">
      {t("مسح المقارنة")}
    </button>
  );
}
