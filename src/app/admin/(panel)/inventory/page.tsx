import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { listStock } from "@/modules/inventory/service";
import { inventoryValuation } from "@/modules/reports/service";
import { PageHeader } from "@/components/admin/page-header";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { actorBranches } from "@/components/admin/range";
import { ActionForm } from "@/ui/action-form";
import { SelectField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Money, Pagination, Table, Td, Th } from "@/ui/primitives";
import { buttonClass } from "@/ui/button";
import { adjustAction } from "./actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("المخزون") };
}

type SP = { q?: string; branch?: string; status?: string; low?: string; page?: string };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await getT();
  const actor = await requireStaffPage("inventory.read");
  const sp = await searchParams;
  const branches = await actorBranches(actor);
  const branchId = branches.some((b) => b.id === sp.branch) ? sp.branch : undefined;
  const status = sp.low ? "low" : sp.status === "low" || sp.status === "out" ? sp.status : "all";
  const showCost = can(actor, "reports.financial");
  const [{ items, total, page, pageSize }, valuation] = await Promise.all([
    listStock(actor, { q: sp.q?.trim().slice(0, 80) || undefined, branchId, status, page: Number(sp.page) || 1 }),
    showCost ? inventoryValuation(actor, branchId) : Promise.resolve([]),
  ]);
  const canAdjust = can(actor, "inventory.adjust");
  const input = "h-9 rounded-md border border-line bg-surface px-2 text-sm";
  return (
    <>
      <PageHeader title={t("المخزون")} description={t("الأرصدة محسوبة من دفتر الحركات؛ كل تعديل يُسجَّل كحركة لا تُحذف.")} />
      <InventoryTabs active="stock" />
      {showCost && valuation.length ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {valuation.map((v) => (
            <div key={v.branch} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-xs text-ink-muted">{v.branch}</p>
              <p className="num mt-1 font-semibold">{t("{0} قطعة", [t.number(v.units)])}</p>
              <p className="text-xs text-ink-muted">{t("تكلفة")}{" "}<Money value={v.cost} /> {t("· بيع")}{" "}<Money value={v.retail} /></p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-4">
        <Card className="xl:col-span-3">
          <form method="get" className="flex flex-wrap gap-2 border-b border-line p-4">
            <input name="q" defaultValue={sp.q} placeholder={t("SKU، باركود أو اسم المنتج")} className={`${input} w-60`} aria-label={t("بحث")} />
            {branches.length > 1 ? (
              <select name="branch" defaultValue={branchId ?? ""} className={input} aria-label={t("الفرع")}>
                <option value="">{t("كل الفروع")}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            ) : null}
            <select name="status" defaultValue={status} className={input} aria-label={t("الحالة")}>
              <option value="all">{t("الكل")}</option>
              <option value="low">{t("منخفض (عند حد إعادة الطلب)")}</option>
              <option value="out">{t("نفد")}</option>
            </select>
            <button className={buttonClass("secondary", "sm")}>{t("تصفية")}</button>
          </form>
          {items.length ? (
            <Table>
              <thead><tr><Th>{t("المنتج")}</Th><Th>{t("الفرع")}</Th><Th>{t("الرصيد")}</Th><Th>{t("محجوز")}</Th><Th>{t("متاح")}</Th><Th>{t("حد الطلب")}</Th><Th></Th></tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <p className="font-medium">{r.variant.product.name}</p>
                      <p className="num text-xs text-ink-muted">{r.variant.sku}{r.variant.colorName ? ` · ${r.variant.colorName}` : ""}</p>
                    </Td>
                    <Td>{r.branch.name}</Td>
                    <Td className="num">{t.number(r.onHand)}</Td>
                    <Td className="num">{t.number(r.reserved)}</Td>
                    <Td><Badge tone={r.available <= 0 ? "danger" : r.available <= r.reorderPoint ? "warning" : "success"}>{t.number(r.available)}</Badge></Td>
                    <Td className="num">{t.number(r.reorderPoint)}</Td>
                    <Td><Link className="text-xs text-sun-700 hover:underline" href={`/admin/inventory/movements?variant=${r.variantId}&branch=${r.branchId}`}>{t("الحركات")}</Link></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState title={t("لا توجد أرصدة مطابقة")} />}
          <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/inventory" params={{ q: sp.q, branch: branchId, status }} />
        </Card>
        {canAdjust ? (
          <Card className="h-fit">
            <CardHeader title={t("تسوية مخزون")} description={t("جرد، تالف، أو رصيد افتتاحي")} />
            <CardBody>
              <ActionForm action={adjustAction} className="space-y-3" resetOnSuccess>
                <SelectField label={t("الفرع")} name="branchId" options={branches.map((b) => ({ value: b.id, label: b.name }))} required />
                <TextField label={t("SKU أو الباركود")} name="sku" dir="ltr" required autoComplete="off" />
                <SelectField label={t("النوع")} name="type" options={[{ value: "ADJUSTMENT", label: t("تسوية / جرد") }, { value: "DAMAGE", label: t("تالف (خصم)") }, { value: "OPENING_BALANCE", label: t("رصيد افتتاحي") }]} />
                <SelectField label={t("الطريقة")} name="mode" options={[{ value: "delta", label: t("تغيير بالكمية (+/−)") }, { value: "count", label: t("الكمية المعدودة فعلياً") }]} />
                <TextField label={t("الكمية")} name="value" inputMode="numeric" dir="ltr" required />
                <TextField label={t("السبب")} name="reason" required />
                <SubmitButton className="w-full">{t("تسجيل الحركة")}</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
