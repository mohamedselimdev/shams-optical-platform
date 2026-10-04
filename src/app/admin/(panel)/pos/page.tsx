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
import { Badge, Card, CardBody, CardHeader, DateText, EmptyState, Money, Table, Td, Th, numberFmt } from "@/ui/primitives";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/i18n/labels";
import { orderTone } from "@/i18n/tones";
import { posSaleAction } from "./actions";

export const metadata = { title: "نقطة البيع" };

export default async function PosPage({ searchParams }: { searchParams: Promise<{ branch?: string; sale?: string }> }) {
  const actor = await requireStaffPage("pos.use");
  const sp = await searchParams;
  const branches = (await actorBranches(actor)).filter((b) => b.type === "STORE" && can(actor, "pos.use", b.id) && can(actor, "orders.create", b.id));
  if (!branches.length) {
    return (
      <>
        <PageHeader title="نقطة البيع" />
        <EmptyState title="لا يوجد فرع متاح لك للبيع" description="نقطة البيع تتطلب صلاحية إنشاء الطلبات في فرع من نوع معرض." />
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
        title="نقطة البيع"
        description="بيع مباشر في الفرع بنفس محرك الأسعار والعروض والمخزون الخاص بالمتجر."
        actions={
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="pos-branch" className="text-sm text-ink-muted">الفرع</label>
            <select id="pos-branch" name="branch" defaultValue={branch.id} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm">
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <button type="submit" className="h-9 rounded-md border border-line-strong px-3 text-sm hover:bg-surface-2">تغيير</button>
          </form>
        }
      />

      {receipt ? (
        <Card className="mb-6 border-success/40" aria-live="polite">
          <CardHeader
            title={<>تم البيع: <span className="num" dir="ltr">{receipt.number}</span></>}
            description={<>{receipt.fulfillmentBranch.name} · <DateText value={receipt.placedAt} withTime /></>}
            actions={<Link href={`/admin/orders/${receipt.id}`} className="text-sm text-sun-800 underline">تفاصيل الطلب</Link>}
          />
          <CardBody className="grid gap-4 sm:grid-cols-4">
            <div><p className="text-xs text-ink-muted">الإجمالي</p><Money value={receipt.total} className="text-xl font-semibold" /></div>
            <div><p className="text-xs text-ink-muted">طريقة الدفع</p><p>{PAYMENT_METHOD_LABELS[receipt.paymentMethod]}</p></div>
            {receipt.tendered !== null ? <div><p className="text-xs text-ink-muted">المستلم</p><Money value={receipt.tendered} /></div> : null}
            {receipt.change !== null ? <div><p className="text-xs text-ink-muted">الباقي للعميل</p><Money value={receipt.change} className="text-xl font-semibold text-success" /></div> : null}
            <ul className="text-sm sm:col-span-4">
              {receipt.items.map((i) => (
                <li key={i.id} className="flex justify-between border-t border-line py-1.5">
                  <span>{i.productName}{i.variantName ? ` — ${i.variantName}` : ""} × <span className="num">{numberFmt.format(i.quantity)}</span></span>
                  <Money value={i.lineTotal} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="عملية بيع جديدة" description={`الفرع: ${branch.name}`} />
          <CardBody>
            {/* key resets the form after each completed sale; the idempotency key blocks double charges on re-submit. */}
            <ActionForm key={sp.sale ?? "new"} action={posSaleAction} className="space-y-5">
              <input type="hidden" name="idempotencyKey" value={`pos_${randomUUID()}`} />
              <input type="hidden" name="branchId" value={branch.id} />
              <SkuLines label="المنتجات (امسح الباركود أو اكتب SKU)" />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="موبايل العميل (اختياري)" name="customerPhone" inputMode="tel" dir="ltr" hint="لربط البيع بملف العميل ونقاط الولاء" />
                <TextField label="اسم العميل" name="customerName" hint="مطلوب فقط لعميل جديد" />
                <TextField label="كوبون الخصم" name="couponCode" dir="ltr" />
                <SelectField label="طريقة الدفع" name="paymentMethod" required options={[{ value: "CASH", label: PAYMENT_METHOD_LABELS.CASH }, { value: "CARD_PRESENT", label: PAYMENT_METHOD_LABELS.CARD_PRESENT }]} />
                <TextField label="المبلغ المستلم نقداً (ج.م)" name="cashTendered" inputMode="decimal" dir="ltr" hint="للدفع النقدي؛ يُحسب الباقي تلقائياً" />
                <TextField label="رقم إيصال ماكينة البطاقة" name="cardReference" dir="ltr" hint="لا تُدخل رقم البطاقة أبداً" autoComplete="off" />
              </div>
              <TextField label="ملاحظة" name="note" />
              <SubmitButton pendingLabel="جارٍ إتمام البيع…">إتمام البيع</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="مبيعات اليوم" description={branch.name} />
          <CardBody className="space-y-4">
            {summary.totals.length ? (
              <ul className="space-y-1 text-sm">
                {summary.totals.map((t) => (
                  <li key={t.method} className="flex justify-between">
                    <span>{PAYMENT_METHOD_LABELS[t.method]} <span className="text-ink-muted">({numberFmt.format(t.count)})</span></span>
                    <Money value={t.total} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">لا توجد مبيعات اليوم بعد.</p>
            )}
            {summary.orders.length ? (
              <Table className="-mx-5">
                <thead>
                  <tr><Th>الطلب</Th><Th>الإجمالي</Th><Th>الحالة</Th></tr>
                </thead>
                <tbody>
                  {summary.orders.map((o) => (
                    <tr key={o.id}>
                      <Td dir="ltr" className="num"><Link href={`/admin/orders/${o.id}`} className="underline">{o.number}</Link></Td>
                      <Td><Money value={o.total} /></Td>
                      <Td><Badge tone={orderTone[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge></Td>
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
