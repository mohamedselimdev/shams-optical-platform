import Link from "next/link";
import { db } from "@/server/db";
import { productCardSelect, toProductCard } from "@/modules/catalog/queries";
import { GENDER_LABELS, PRODUCT_TYPE_LABELS, shapeLabel } from "@/i18n/labels";
import { ClearCompare } from "@/components/store/browsing-history";
import { EmptyState, Money } from "@/ui/primitives";
import { ButtonLink } from "@/ui/button";

export const metadata = { title: "مقارنة المنتجات", robots: { index: false } };

export default async function Compare({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const ids = ((await searchParams).ids ?? "").split(",").filter((x) => /^[a-z0-9]{10,40}$/i.test(x)).slice(0, 4);
  const rows = ids.length
    ? await db.product.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: { ...productCardSelect, gender: true, frameShape: true, frameMaterial: true, variants: { ...productCardSelect.variants, select: { ...productCardSelect.variants.select, lensWidthMm: true, bridgeMm: true, templeMm: true } } } })
    : [];
  if (rows.length < 2) return <div className="container-page py-16"><EmptyState title="أضف منتجين على الأقل للمقارنة" description="استخدم زر «أضف للمقارنة» في صفحة المنتج." action={<ButtonLink href="/shop">تصفح المنتجات</ButtonLink>} /></div>;
  const products = rows.map((r) => ({ row: r, card: toProductCard(r) }));
  const attrs: [string, (r: (typeof rows)[number]) => React.ReactNode][] = [
    ["السعر", (r) => <Money value={toProductCard(r).price} />],
    ["الماركة", (r) => r.brand?.name ?? "—"],
    ["النوع", (r) => PRODUCT_TYPE_LABELS[r.type]],
    ["لمن", (r) => (r.gender ? GENDER_LABELS[r.gender] : "—")],
    ["الشكل", (r) => shapeLabel(r.frameShape) || "—"],
    ["الخامة", (r) => r.frameMaterial ?? "—"],
    ["المقاس", (r) => (r.variants[0]?.lensWidthMm ? <span className="num" dir="ltr">{r.variants[0].lensWidthMm}□{r.variants[0].bridgeMm} {r.variants[0].templeMm}</span> : "—")],
    ["عدسات طبية", (r) => (r.prescriptionCompatible ? "✓" : "—")],
    ["مستقطبة", (r) => (r.polarized ? "✓" : "—")],
    ["الألوان", (r) => r.variants.map((v) => v.colorName).filter(Boolean).join("، ") || "—"],
  ];
  return (
    <div className="container-page py-10">
      <div className="mb-6 flex items-center justify-between"><h1 className="font-display text-3xl font-semibold">مقارنة المنتجات</h1><ClearCompare /></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr><th className="w-32" />{products.map(({ card }) => (
              <th key={card.id} className="p-3 align-top font-normal">
                <Link href={`/p/${card.slug}`} className="block">
                  {card.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- product media thumbnail.
                    <img src={card.image.url} alt="" className="aspect-[4/3] w-full rounded-md border border-line object-cover" />
                  ) : null}
                  <span className="mt-2 block font-medium">{card.name}</span>
                </Link>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {attrs.map(([label, get]) => (
              <tr key={label} className="border-t border-line"><th className="p-3 text-start font-medium text-ink-muted">{label}</th>{products.map(({ row }) => <td key={row.id} className="p-3 text-center">{get(row)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
