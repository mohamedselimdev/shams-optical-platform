import { requireStaffPage } from "@/server/auth/session";
import { listMovements } from "@/modules/inventory/service";
import { PageHeader } from "@/components/admin/page-header";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { actorBranches } from "@/components/admin/range";
import { Badge, Card, DateText, EmptyState, Pagination, Table, Td, Th } from "@/ui/primitives";
import { buttonClass } from "@/ui/button";
import { MOVEMENT_LABELS } from "@/i18n/labels";
import { db } from "@/server/db";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("دفتر حركات المخزون") };
}

type SP = { branch?: string; variant?: string; type?: string; page?: string };

export default async function MovementsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await getT();
  const actor = await requireStaffPage("inventory.read");
  const sp = await searchParams;
  const branches = await actorBranches(actor);
  const branchId = branches.some((b) => b.id === sp.branch) ? sp.branch : undefined;
  const type = sp.type && sp.type in MOVEMENT_LABELS ? sp.type : undefined;
  const variantId = sp.variant?.slice(0, 64) || undefined;
  const { items, total, page, pageSize } = await listMovements(actor, { branchId, variantId, type, page: Number(sp.page) || 1 });
  const actorIds = [...new Set(items.map((m) => m.actorId).filter((x): x is string => Boolean(x)))];
  const users = new Map((await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const input = "h-9 rounded-md border border-line bg-surface px-2 text-sm";
  return (
    <>
      <PageHeader title={t("دفتر حركات المخزون")} description={t("سجل غير قابل للتعديل لكل تغيير في الرصيد أو الحجز.")} />
      <InventoryTabs active="movements" />
      <Card>
        <form method="get" className="flex flex-wrap gap-2 border-b border-line p-4">
          {variantId ? <input type="hidden" name="variant" value={variantId} /> : null}
          <select name="branch" defaultValue={branchId ?? ""} className={input} aria-label={t("الفرع")}>
            <option value="">{t("كل الفروع")}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select name="type" defaultValue={type ?? ""} className={input} aria-label={t("نوع الحركة")}>
            <option value="">{t("كل الأنواع")}</option>
            {Object.entries(MOVEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <button className={buttonClass("secondary", "sm")}>{t("تصفية")}</button>
          {variantId ? <a href="/admin/inventory/movements" className={buttonClass("ghost", "sm")}>{t("إزالة تصفية المنتج")}</a> : null}
        </form>
        {items.length ? (
          <Table>
            <thead><tr><Th>{t("التاريخ")}</Th><Th>{t("المنتج")}</Th><Th>{t("الفرع")}</Th><Th>{t("النوع")}</Th><Th>{t("الرصيد ±")}</Th><Th>{t("الحجز ±")}</Th><Th>{t("بعد الحركة")}</Th><Th>{t("المرجع / السبب")}</Th><Th>{t("بواسطة")}</Th></tr></thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <Td><DateText value={m.createdAt} withTime /></Td>
                  <Td><p>{m.variant.product.name}</p><p className="num text-xs text-ink-muted">{m.variant.sku}</p></Td>
                  <Td>{m.branch.name}</Td>
                  <Td><Badge tone={m.quantity < 0 ? "warning" : m.quantity > 0 ? "success" : "neutral"}>{t(MOVEMENT_LABELS[m.type])}</Badge></Td>
                  <Td className="num" dir="ltr">{m.quantity ? (m.quantity > 0 ? `+${m.quantity}` : m.quantity) : "—"}</Td>
                  <Td className="num" dir="ltr">{m.reservedDelta ? (m.reservedDelta > 0 ? `+${m.reservedDelta}` : m.reservedDelta) : "—"}</Td>
                  <Td className="num">{t.number(m.onHandAfter)} / {t.number(m.reservedAfter)}</Td>
                  <Td className="max-w-56 text-xs">{m.referenceType ? <span className="num text-ink-muted">{m.referenceType}:{m.referenceId?.slice(-8)}</span> : null}{m.reason ? <span className="block">{m.reason}</span> : null}</Td>
                  <Td className="text-xs">{m.actorId ? users.get(m.actorId) ?? "—" : t("النظام")}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title={t("لا توجد حركات")} />}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/inventory/movements" params={{ branch: branchId, type, variant: variantId }} />
      </Card>
    </>
  );
}
