"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While a payment confirmation (webhook) is pending, refresh the server view a few times. */
export function AutoRefresh({ intervalMs = 3000, max = 10 }: { intervalMs?: number; max?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= max) clearInterval(timer);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs, max]);
  return null;
}
