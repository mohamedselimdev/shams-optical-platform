"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While a payment confirmation (webhook) is pending, refresh the server view a few times. */
export function AutoRefresh({ intervalMs = 3000, max = 10 }: { intervalMs?: number; max?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= max) clearInterval(t);
    }, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs, max]);
  return null;
}
