"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/ui/button";
import { useFieldError } from "@/ui/action-form";
import { useT } from "@/i18n/client";

/** Repeater of SKU/barcode + quantity (+ optional unit cost) rows. SKUs are resolved on the server. */
export function SkuLines({ withCost = false, label = "البنود" }: { withCost?: boolean; label?: string }) {
  const t = useT();
  const [rows, setRows] = useState(() => [crypto.randomUUID()]);
  const error = useFieldError("items");
  const input = "h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm";
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium text-ink-soft">{t(label)}</legend>
      {rows.map((key, i) => (
        <div key={key} className="flex items-center gap-2">
          <input name={`lines.${i}.sku`} placeholder={t("SKU أو باركود")} dir="ltr" className={input} aria-label={t("SKU البند {0}", [i + 1])} required autoComplete="off" />
          <input name={`lines.${i}.quantity`} placeholder={t("الكمية")} inputMode="numeric" dir="ltr" className={`${input} !w-24`} aria-label={t("كمية البند {0}", [i + 1])} required />
          {withCost ? <input name={`lines.${i}.unitCost`} placeholder={t("تكلفة الوحدة")} inputMode="decimal" dir="ltr" className={`${input} !w-32`} aria-label={t("تكلفة البند {0}", [i + 1])} required /> : null}
          <Button size="icon" variant="ghost" aria-label={t("حذف البند {0}", [i + 1])} disabled={rows.length === 1} onClick={() => setRows((r) => r.filter((k) => k !== key))}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ))}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <Button size="sm" variant="ghost" onClick={() => setRows((r) => [...r, crypto.randomUUID()])}>
        <Plus className="h-4 w-4" aria-hidden /> {t("إضافة بند")}
      </Button>
    </fieldset>
  );
}
