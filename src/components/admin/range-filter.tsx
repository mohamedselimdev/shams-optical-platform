import { buttonClass } from "@/ui/button";
import { getT } from "@/i18n/server";

/** Plain GET form so filters are shareable URLs and work without JavaScript. */
export async function RangeFilter({ fromStr, toStr, branchId, branches, extra }: { fromStr: string; toStr: string; branchId: string | null; branches: { id: string; name: string }[]; extra?: Record<string, string> }) {
  const t = await getT();
  const input = "h-9 rounded-md border border-line bg-surface px-2 text-sm";
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      {extra ? Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      <label className="text-xs text-ink-muted">
        {t("من")}
        <input type="date" name="from" defaultValue={fromStr} className={`${input} mt-1 block`} />
      </label>
      <label className="text-xs text-ink-muted">
        {t("إلى")}
        <input type="date" name="to" defaultValue={toStr} className={`${input} mt-1 block`} />
      </label>
      {branches.length > 1 ? (
        <label className="text-xs text-ink-muted">
          {t("الفرع")}
          <select name="branch" defaultValue={branchId ?? ""} className={`${input} mt-1 block`}>
            <option value="">{t("كل الفروع")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      <button type="submit" className={buttonClass("secondary", "sm")}>{t("تطبيق")}</button>
    </form>
  );
}
