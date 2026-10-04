import { buttonClass } from "@/ui/button";

/** Plain GET form so filters are shareable URLs and work without JavaScript. */
export function RangeFilter({ fromStr, toStr, branchId, branches, extra }: { fromStr: string; toStr: string; branchId: string | null; branches: { id: string; name: string }[]; extra?: Record<string, string> }) {
  const input = "h-9 rounded-md border border-line bg-surface px-2 text-sm";
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      {extra ? Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      <label className="text-xs text-ink-muted">
        من
        <input type="date" name="from" defaultValue={fromStr} className={`${input} mt-1 block`} />
      </label>
      <label className="text-xs text-ink-muted">
        إلى
        <input type="date" name="to" defaultValue={toStr} className={`${input} mt-1 block`} />
      </label>
      {branches.length > 1 ? (
        <label className="text-xs text-ink-muted">
          الفرع
          <select name="branch" defaultValue={branchId ?? ""} className={`${input} mt-1 block`}>
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      <button type="submit" className={buttonClass("secondary", "sm")}>تطبيق</button>
    </form>
  );
}
