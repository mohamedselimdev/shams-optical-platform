import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { listProductsAdmin, catalogFormOptions } from "@/modules/catalog/service";
import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card, EmptyState, Money, Pagination, Table, Td, Th } from "@/ui/primitives";
import { ButtonLink, buttonClass } from "@/ui/button";
import { PRODUCT_STATUS_LABELS, PRODUCT_TYPE_LABELS } from "@/i18n/labels";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("المنتجات") };
}

type SP = { q?: string; status?: string; type?: string; brand?: string; page?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await getT();
  const actor = await requireStaffPage("catalog.read");
  const sp = await searchParams;
  const status = sp.status && sp.status in PRODUCT_STATUS_LABELS ? sp.status : undefined;
  const type = sp.type && sp.type in PRODUCT_TYPE_LABELS ? sp.type : undefined;
  const [{ items, total, page, pageSize }, { brands }] = await Promise.all([
    listProductsAdmin(actor, { q: sp.q, status, type, brandId: sp.brand || undefined, page: Number(sp.page) || 1 }),
    catalogFormOptions(),
  ]);
  const input = "h-9 rounded-md border border-line bg-surface px-2 text-sm";
  return (
    <>
      <PageHeader title={t("المنتجات")} description={t("{0} منتج", [t.number(total)])} actions={can(actor, "catalog.write") ? <ButtonLink href="/admin/products/new" size="sm">{t("منتج جديد")}</ButtonLink> : null} />
      <Card>
        <form method="get" className="flex flex-wrap gap-2 border-b border-line p-4">
          <input name="q" defaultValue={sp.q} placeholder={t("الاسم أو SKU أو الباركود")} className={`${input} w-64`} aria-label={t("بحث")} />
          <select name="status" defaultValue={status ?? ""} className={input} aria-label={t("الحالة")}>
            <option value="">{t("كل الحالات")}</option>
            {Object.entries(PRODUCT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <select name="type" defaultValue={type ?? ""} className={input} aria-label={t("النوع")}>
            <option value="">{t("كل الأنواع")}</option>
            {Object.entries(PRODUCT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <select name="brand" defaultValue={sp.brand ?? ""} className={input} aria-label={t("الماركة")}>
            <option value="">{t("كل الماركات")}</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className={buttonClass("secondary", "sm")}>{t("بحث")}</button>
        </form>
        {items.length ? (
          <Table>
            <thead><tr><Th>{t("المنتج")}</Th><Th>{t("النوع")}</Th><Th>{t("الماركة")}</Th><Th>{t("الحالة")}</Th><Th>{t("المتغيرات")}</Th><Th>{t("المتاح")}</Th><Th>{t("يبدأ من")}</Th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.images[0] ? <img src={p.images[0].url} alt="" className="h-10 w-14 rounded bg-surface-2 object-contain" /> : <span className="h-10 w-14 rounded bg-surface-2" />}
                      <span className="font-medium hover:text-sun-700">{p.name}</span>
                    </Link>
                  </Td>
                  <Td>{t(PRODUCT_TYPE_LABELS[p.type])}</Td>
                  <Td>{p.brand?.name ?? "—"}</Td>
                  <Td><Badge tone={p.status === "ACTIVE" ? "success" : p.status === "DRAFT" ? "warning" : "neutral"}>{t(PRODUCT_STATUS_LABELS[p.status])}</Badge></Td>
                  <Td className="num">{t.number(p.activeVariants)}</Td>
                  <Td><Badge tone={p.available > 0 ? "neutral" : "danger"}>{t.number(p.available)}</Badge></Td>
                  <Td><Money value={p.minPrice} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title={t("لا توجد منتجات مطابقة")} />}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/products" params={{ q: sp.q, status, type, brand: sp.brand }} />
      </Card>
    </>
  );
}
