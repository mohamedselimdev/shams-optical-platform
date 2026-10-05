import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { catalogFacets, searchProducts, type CatalogFilter } from "@/modules/catalog/queries";
import { GENDER_LABELS, PRODUCT_TYPE_LABELS, shapeLabel } from "@/i18n/labels";
import { EmptyState, Pagination } from "@/ui/primitives";
import { ProductGrid } from "./product-card";
import { TrackOnMount } from "./track-on-mount";
import { getT } from "@/i18n/server";

const SORTS: [CatalogFilter["sort"], string][] = [["newest", "الأحدث"], ["popular", "الأكثر مبيعاً"], ["price_asc", "السعر: من الأقل"], ["price_desc", "السعر: من الأعلى"]];

/**
 * Product listing with server-side filtering. The filter form is a plain GET form, so it works
 * without JavaScript and every filtered view has a shareable URL. `fixed` keys come from the route
 * (e.g. /c/sunglasses) and are not shown as editable filters.
 */
export async function CatalogListing({ filter, basePath, fixed = {} }: { filter: CatalogFilter; basePath: string; fixed?: Partial<Record<"category" | "brand" | "collection", string>> }) {
  const t = await getT();
  const [result, facets] = await Promise.all([searchProducts(filter), catalogFacets()]);
  const params: Record<string, string | undefined> = {
    q: filter.q, type: filter.type, gender: filter.gender, shape: filter.shape, material: filter.material, color: filter.color,
    min: filter.min?.toString(), max: filter.max?.toString(), polarized: filter.polarized, rx: filter.rx, sale: filter.sale, instock: filter.instock,
    sort: filter.sort === "newest" ? undefined : filter.sort, category: fixed.category ? undefined : filter.category,
    brand: fixed.brand ? undefined : filter.brand.join(",") || undefined, collection: fixed.collection ? undefined : filter.collection,
  };
  const activeCount = Object.entries(params).filter(([k, v]) => v && k !== "sort" && k !== "q").length;
  const select = "h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm";

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      {filter.q ? <TrackOnMount event={{ name: "search", props: { q: filter.q.slice(0, 100), results: result.total } }} /> : null}
      <details className="group rounded-lg border border-line bg-surface lg:border-0 lg:bg-transparent" open>
        <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium lg:hidden">
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> {t("الفلاتر")}{" "}{activeCount ? <span className="num">({t.number(activeCount)})</span> : null}
        </summary>
        <form method="get" action={basePath} className="space-y-5 p-4 pt-0 lg:p-0">
          {filter.q ? <input type="hidden" name="q" value={filter.q} /> : null}
          {filter.sort !== "newest" ? <input type="hidden" name="sort" value={filter.sort} /> : null}
          {!fixed.category && facets.categories.length ? (
            <label className="block space-y-1.5 text-sm"><span className="font-medium">{t("الفئة")}</span>
              <select name="category" defaultValue={filter.category ?? ""} className={select}>
                <option value="">{t("الكل")}</option>
                {facets.categories.map((c) => (
                  <optgroup key={c.slug} label={c.name}>
                    <option value={c.slug}>{t("كل {0}", [c.name])}</option>
                    {c.children.map((ch) => <option key={ch.slug} value={ch.slug}>{ch.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          ) : null}
          {!fixed.brand && facets.brands.length ? (
            <fieldset className="space-y-1.5 text-sm">
              <legend className="mb-1.5 font-medium">{t("الماركة")}</legend>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {facets.brands.map((b) => (
                  <label key={b.slug} className="flex items-center gap-2"><input type="checkbox" name="brand" value={b.slug} defaultChecked={filter.brand.includes(b.slug)} className="accent-ink" /> {b.name}</label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label className="block space-y-1.5 text-sm"><span className="font-medium">{t("النوع")}</span>
            <select name="type" defaultValue={filter.type ?? ""} className={select}>
              <option value="">{t("الكل")}</option>
              {Object.entries(PRODUCT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm"><span className="font-medium">{t("لمن")}</span>
            <select name="gender" defaultValue={filter.gender ?? ""} className={select}>
              <option value="">{t("الكل")}</option>
              {Object.entries(GENDER_LABELS).map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
          </label>
          {facets.shapes.length ? (
            <label className="block space-y-1.5 text-sm"><span className="font-medium">{t("شكل الإطار")}</span>
              <select name="shape" defaultValue={filter.shape ?? ""} className={select}><option value="">{t("الكل")}</option>{facets.shapes.map((s) => <option key={s} value={s}>{t(shapeLabel(s))}</option>)}</select>
            </label>
          ) : null}
          {facets.materials.length ? (
            <label className="block space-y-1.5 text-sm"><span className="font-medium">{t("الخامة")}</span>
              <select name="material" defaultValue={filter.material ?? ""} className={select}><option value="">{t("الكل")}</option>{facets.materials.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            </label>
          ) : null}
          {facets.colors.length ? (
            <label className="block space-y-1.5 text-sm"><span className="font-medium">{t("اللون")}</span>
              <select name="color" defaultValue={filter.color ?? ""} className={select}><option value="">{t("الكل")}</option>{facets.colors.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            </label>
          ) : null}
          <fieldset className="text-sm">
            <legend className="mb-1.5 font-medium">{t("السعر (ج.م)")}</legend>
            <div className="flex gap-2">
              <input name="min" inputMode="numeric" placeholder={t("من")} defaultValue={filter.min ?? ""} className={select} aria-label={t("أقل سعر")} dir="ltr" />
              <input name="max" inputMode="numeric" placeholder={t("إلى")} defaultValue={filter.max ?? ""} className={select} aria-label={t("أعلى سعر")} dir="ltr" />
            </div>
          </fieldset>
          <fieldset className="space-y-1.5 text-sm">
            {([["rx", t("يدعم العدسات الطبية")], ["polarized", t("عدسات مستقطبة")], ["sale", t("عليه تخفيض")], ["instock", t("متوفر الآن")]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" name={k} value="1" defaultChecked={Boolean(filter[k])} className="accent-ink" /> {l}</label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <button type="submit" className="h-9 flex-1 rounded-md bg-ink text-sm font-medium text-surface">{t("تطبيق")}</button>
            {activeCount ? <Link href={filter.q ? `${basePath}?q=${encodeURIComponent(filter.q)}` : basePath} className="flex h-9 items-center rounded-md border border-line-strong px-3 text-sm">{t("مسح")}</Link> : null}
          </div>
        </form>
      </details>

      <div>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted"><span className="num">{t.number(result.total)}</span> {t("منتج")}</p>
          <nav aria-label={t("الترتيب")} className="flex flex-wrap gap-1 text-sm">
            {SORTS.map(([value, label]) => {
              const next: Record<string, string | undefined> = { ...params, sort: value === "newest" ? undefined : value };
              const sp = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => Boolean(e[1])));
              const href = sp.size ? `${basePath}?${sp}` : basePath;
              return <Link key={value} href={href} aria-current={filter.sort === value ? "true" : undefined} className={`rounded-full px-3 py-1.5 ${filter.sort === value ? "bg-ink text-surface" : "hover:bg-surface-2"}`}>{t(label)}</Link>;
            })}
          </nav>
        </div>
        {result.items.length ? (
          <ProductGrid products={result.items} />
        ) : (
          <EmptyState title={t("لا توجد منتجات مطابقة")} description={t("جرّب إزالة بعض الفلاتر أو البحث بكلمة أخرى.")} />
        )}
        <Pagination page={result.page} pageCount={result.pageCount} basePath={basePath} params={params} />
      </div>
    </div>
  );
}
