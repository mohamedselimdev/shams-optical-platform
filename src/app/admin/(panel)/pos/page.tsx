import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { getPosReceipt, posTodaySummary } from "@/modules/pos/service";
import { cairoDate, cairoDayStart } from "@/lib/cairo-time";
import { PageHeader } from "@/components/admin/page-header";
import { actorBranches } from "@/components/admin/range";
import { SkuLines } from "@/components/admin/sku-lines";
import { ActionForm } from "@/ui/action-form";
import { SelectField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, DateText, EmptyState, Money, Table, Td, Th } from "@/ui/primitives";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/i18n/labels";
import { orderTone } from "@/i18n/tones";
import { posSaleAction } from "./actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("نقطة البيع") };
}

export default async function PosPage({ searchParams }: { searchParams: Promise<{ branch?: string; sale?: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("pos.use");
  const sp = await searchParams;
  const branches = (await actorBranches(actor)).filter((b) => b.type === "STORE" && can(actor, "pos.use", b.id) && can(actor, "orders.create", b.id));
  if (!branches.length) {
    return (
      <>
        <PageHeader title={t("نقطة البيع")} />
        <EmptyState title={t("لا يوجد فرع متاح لك للبيع")} description={t("نقطة البيع تتطلب صلاحية إنشاء الطلبات في فرع من نوع معرض.")} />
      </>
    );
  }
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0];
  const [summary, receipt] = await Promise.all([
    posTodaySummary(actor, branch.id, cairoDayStart(cairoDate())),
    sp.sale ? getPosReceipt(actor, sp.sale) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title={t("نقطة البيع")}
        description={t("بيع مباشر في الفرع بنفس محرك الأسعار والعروض والمخزون الخاص بالمتجر.")}
        actions={
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="pos-branch" className="text-sm text-ink-muted">{t("الفرع")}</label>
            <select id="pos-branch" name="branch" defaultValue={branch.id} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm">
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <button type="submit" className="h-9 rounded-md border border-line-strong px-3 text-sm hover:bg-surface-2">{t("تغيير")}</button>
          </form>
        }
      />

      {receipt ? (
        <Card className="mb-6 border-success/40" aria-live="polite">
          <CardHeader
            title={<>{t("تم البيع:")}{" "}<span className="num" dir="ltr">{receipt.number}</span></>}
            description={<>{receipt.fulfillmentBranch.name} · <DateText value={receipt.placedAt} withTime /></>}
            actions={<Link href={`/admin/orders/${receipt.id}`} className="text-sm text-sun-800 underline">{t("تفاصيل الطلب")}</Link>}
          />
          <CardBody className="grid gap-4 sm:grid-cols-4">
            <div><p className="text-xs text-ink-muted">{t("الإجمالي")}</p><Money value={receipt.total} className="text-xl font-semibold" /></div>
            <div><p className="text-xs text-ink-muted">{t("طريقة الدفع")}</p><p>{t(PAYMENT_METHOD_LABELS[receipt.paymentMethod])}</p></div>
            {receipt.tendered !== null ? <div><p className="text-xs text-ink-muted">{t("المستلم")}</p><Money value={receipt.tendered} /></div> : null}
            {receipt.change !== null ? <div><p className="text-xs text-ink-muted">{t("الباقي للعميل")}</p><Money value={receipt.change} className="text-xl font-semibold text-success" /></div> : null}
            <ul className="text-sm sm:col-span-4">
              {receipt.items.map((i) => (
                <li key={i.id} className="flex justify-between border-t border-line py-1.5">
                  <span>{i.productName}{i.variantName ? ` — ${i.variantName}` : ""} × <span className="num">{t.number(i.quantity)}</span></span>
                  <Money value={i.lineTotal} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title={t("عملية بيع جديدة")} description={t("الفرع: {0}", [branch.name])} />
          <CardBody>
            {/* key resets the form after each completed sale; the idempotency key blocks double charges on re-submit. */}
            <ActionForm key={sp.sale ?? "new"} action={posSaleAction} className="space-y-5">
              <input type="hidden" name="idempotencyKey" value={`pos_${randomUUID()}`} />
              <input type="hidden" name="branchId" value={branch.id} />
              <SkuLines label={t("المنتجات (امسح الباركود أو اكتب SKU)")} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={t("موبايل العميل (اختياري)")} name="customerPhone" inputMode="tel" dir="ltr" hint={t("لربط البيع بملف العميل ونقاط الولاء")} />
                <TextField label={t("اسم العميل")} name="customerName" hint={t("مطلوب فقط لعميل جديد")} />
                <TextField label={t("كوبون الخصم")} name="couponCode" dir="ltr" />
                <SelectField label={t("طريقة الدفع")} name="paymentMethod" required options={[{ value: "CASH", label: t(PAYMENT_METHOD_LABELS.CASH) }, { value: "CARD_PRESENT", label: t(PAYMENT_METHOD_LABELS.CARD_PRESENT) }]} />
                <TextField label={t("المبلغ المستلم نقداً (ج.م)")} name="cashTendered" inputMode="decimal" dir="ltr" hint={t("للدفع النقدي؛ يُحسب الباقي تلقائياً")} />
                <TextField label={t("رقم إيصال ماكينة البطاقة")} name="cardReference" dir="ltr" hint={t("لا تُدخل رقم البطاقة أبداً")} autoComplete="off" />
              </div>
              <TextField label={t("ملاحظة")} name="note" />
              <SubmitButton pendingLabel={t("جارٍ إتمام البيع…")}>{t("إتمام البيع")}</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("مبيعات اليوم")} description={branch.name} />
          <CardBody className="space-y-4">
            {summary.totals.length ? (
              <ul className="space-y-1 text-sm">
                {summary.totals.map((row) => (
                  <li key={row.method} className="flex justify-between">
                    <span>{t(PAYMENT_METHOD_LABELS[row.method])} <span className="text-ink-muted">({t.number(row.count)})</span></span>
                    <Money value={row.total} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">{t("لا توجد مبيعات اليوم بعد.")}</p>
            )}
            {summary.orders.length ? (
              <Table className="-mx-5">
                <thead>
                  <tr><Th>{t("الطلب")}</Th><Th>{t("الإجمالي")}</Th><Th>{t("الحالة")}</Th></tr>
                </thead>
                <tbody>
                  {summary.orders.map((o) => (
                    <tr key={o.id}>
                      <Td dir="ltr" className="num"><Link href={`/admin/orders/${o.id}`} className="underline">{o.number}</Link></Td>
                      <Td><Money value={o.total} /></Td>
                      <Td><Badge tone={orderTone[o.status]}>{t(ORDER_STATUS_LABELS[o.status])}</Badge></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
