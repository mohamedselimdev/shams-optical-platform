import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { getOrderForStaff } from "@/modules/orders/service";
import { allowedTransitions, MANUAL_TARGETS } from "@/modules/orders/state";
import type { LensSnapshot } from "@/modules/lenses/pricing";
import { formatDiopter, formatPd } from "@/lib/optics";
import { loadOr404 } from "@/components/admin/load";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, TextArea, TextField, SelectField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, DateText, DefinitionList, Money, Table, Td, Th } from "@/ui/primitives";
import { ATTEMPT_STATUS_LABELS, CHANNEL_LABELS, FULFILLMENT_LABELS, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, REFUND_STATUS_LABELS, RETURN_STATUS_LABELS, RX_MODE_LABELS } from "@/i18n/labels";
import { attemptTone, orderTone, paymentTone, returnTone } from "@/i18n/tones";
import { noteAction, refundAction, transitionAction } from "./actions";
import { staffCreateReturnAction } from "../../returns/actions";
import { getT } from "@/i18n/server";

type Addr = { fullName?: string; phone?: string; governorate?: string; city?: string; area?: string; street?: string; building?: string; floor?: string; apartment?: string; landmark?: string };

const RX_ROWS: [string, string][] = [["SPH", "Sph"], ["CYL", "Cyl"], ["AXIS", "Axis"], ["ADD", "Add"]];

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("orders.read");
  const { id } = await params;
  const order = await loadOr404(() => getOrderForStaff(actor, id));
  const canUpdate = can(actor, "orders.update", order.fulfillmentBranchId);
  const canCancel = can(actor, "orders.cancel", order.fulfillmentBranchId);
  const canRx = can(actor, "prescriptions.read");
  const canRefund = can(actor, "payments.refund", order.fulfillmentBranchId);
  const next = allowedTransitions(order.status, order.fulfillmentType).filter((s) => MANUAL_TARGETS.includes(s));
  const addr = (order.shippingAddress ?? null) as Addr | null;
  const awaitingCollection = order.paymentStatus !== "PAID" && ["COD", "PAY_AT_BRANCH"].includes(order.paymentMethod);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/orders", label: t("الطلبات") }}
        title={<span className="num">{order.number}</span>}
        description={<>{t(CHANNEL_LABELS[order.channel])} · <DateText value={order.placedAt} withTime /></>}
        actions={
          <>
            <Badge tone={orderTone[order.status]}>{t(ORDER_STATUS_LABELS[order.status])}</Badge>
            <Badge tone={paymentTone[order.paymentStatus]}>{t(PAYMENT_STATUS_LABELS[order.paymentStatus])}</Badge>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title={t("الأصناف")} />
            <Table>
              <thead><tr><Th>{t("المنتج")}</Th><Th>{t("الكمية")}</Th><Th>{t("السعر")}</Th><Th>{t("الخصم")}</Th><Th>{t("الإجمالي")}</Th></tr></thead>
              <tbody>
                {order.items.map((it) => {
                  const lens = it.lensSnapshot as LensSnapshot | null;
                  const rx = it.prescriptionSnapshot as { label: string; status: string; values: Record<string, number | null> } | null;
                  return (
                    <tr key={it.id} className="align-top">
                      <Td>
                        <p className="font-medium">{it.productName}</p>
                        <p className="num text-xs text-ink-muted">{it.sku}{it.variantName ? ` · ${it.variantName}` : ""}</p>
                        {lens ? (
                          <div className="mt-2 rounded-md bg-surface-2 p-2 text-xs">
                            <p>{t("عدسات: {0} · {1}", [lens.type.name, lens.index.name])}</p>
                            {lens.options.length ? <p className="text-ink-muted">{lens.options.map((o) => o.name).join(t("، "))}</p> : null}
                            <p className="mt-1">{t("نوع الوصفة: {0}", [t(RX_MODE_LABELS[it.prescriptionMode])])}</p>
                          </div>
                        ) : null}
                        {rx && canRx ? (
                          <details className="mt-2 text-xs">
                            <summary className="cursor-pointer text-sun-700">{t("عرض قيم الوصفة ({0})", [rx.label])}</summary>
                            <table className="num mt-2 border-collapse text-center" dir="ltr">
                              <thead><tr><th className="px-2"></th>{RX_ROWS.map(([, l]) => <th key={l} className="px-2 font-medium">{l}</th>)}</tr></thead>
                              <tbody>
                                {(["od", "os"] as const).map((eye) => (
                                  <tr key={eye}>
                                    <th className="px-2 font-medium">{eye.toUpperCase()}</th>
                                    {RX_ROWS.map(([k]) => {
                                      const v = rx.values[`${eye}${k[0]}${k.slice(1).toLowerCase()}`];
                                      return <td key={k} className="px-2">{v == null ? "—" : k === "AXIS" ? v : formatDiopter(v)}</td>;
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="num mt-1" dir="ltr">PD: {rx.values.pd != null ? formatPd(rx.values.pd) : `${formatPd(rx.values.pdRight)} / ${formatPd(rx.values.pdLeft)}`}</p>
                            {it.prescriptionId ? <Link href={`/admin/prescriptions/${it.prescriptionId}`} className="mt-1 inline-block text-sun-700 underline">{t("فتح الوصفة")}</Link> : null}
                          </details>
                        ) : null}
                      </Td>
                      <Td className="num">{t.number(it.quantity)}{it.returnedQuantity ? <span className="block text-xs text-clay">{t("مرتجع {0}", [it.returnedQuantity])}</span> : null}</Td>
                      <Td><Money value={it.unitPrice + it.lensUnitPrice} /></Td>
                      <Td>{it.discountTotal ? <Money value={-it.discountTotal} /> : "—"}</Td>
                      <Td><Money value={it.lineTotal} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <CardBody className="border-t border-line">
              <dl className="ms-auto max-w-xs space-y-1.5 text-sm">
                <Row label={t("المجموع الفرعي")} value={order.subtotal} />
                {order.discountTotal ? <Row label={t("الخصم{0}", [order.couponCode ? ` (${order.couponCode})` : ""])} value={-order.discountTotal} /> : null}
                {order.loyaltyDiscount ? <Row label={t("نقاط الولاء ({0})", [t.number(order.loyaltyPointsRedeemed)])} value={-order.loyaltyDiscount} /> : null}
                <Row label={t("الشحن")} value={order.shippingTotal} />
                {order.codFee ? <Row label={t("رسوم الدفع عند الاستلام")} value={order.codFee} /> : null}
                <Row label={t("ضريبة القيمة المضافة (ضمن السعر)")} value={order.taxTotal} muted />
                <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>{t("الإجمالي")}</dt><dd><Money value={order.total} /></dd></div>
                <Row label={t("المدفوع")} value={order.paidTotal} muted />
                {order.refundedTotal ? <Row label={t("المسترد")} value={-order.refundedTotal} muted /> : null}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("المدفوعات والمستردات")} />
            {order.payments.length ? (
              <Table>
                <thead><tr><Th>{t("الطريقة")}</Th><Th>{t("المزود")}</Th><Th>{t("الحالة")}</Th><Th>{t("المبلغ")}</Th><Th>{t("المسترد")}</Th><Th>{t("التاريخ")}</Th></tr></thead>
                <tbody>
                  {order.payments.map((p) => (
                    <tr key={p.id}>
                      <Td>{t(PAYMENT_METHOD_LABELS[p.method])}</Td>
                      <Td className="num text-xs">{p.provider}{p.externalId ? <span className="block text-ink-muted" dir="ltr">{p.externalId}</span> : null}</Td>
                      <Td><Badge tone={attemptTone[p.status]}>{t(ATTEMPT_STATUS_LABELS[p.status])}</Badge>{p.failureReason ? <span className="block text-xs text-danger">{p.failureReason}</span> : null}</Td>
                      <Td><Money value={p.amount} /></Td>
                      <Td>{p.refundedAmount ? <Money value={p.refundedAmount} /> : "—"}</Td>
                      <Td><DateText value={p.createdAt} withTime /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <CardBody><p className="text-sm text-ink-muted">{t("لا توجد عمليات دفع بعد.")}</p></CardBody>}
            {order.refunds.length ? (
              <CardBody className="border-t border-line">
                <h3 className="mb-2 text-sm font-semibold">{t("المستردات")}</h3>
                <ul className="space-y-1 text-sm">
                  {order.refunds.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <Money value={r.amount} /> <Badge tone={r.status === "SUCCEEDED" ? "success" : r.status === "FAILED" ? "danger" : "warning"}>{t(REFUND_STATUS_LABELS[r.status])}</Badge>
                      <span className="text-ink-muted">{r.reason && t.message(r.reason)}</span> <DateText value={r.createdAt} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            ) : null}
            {canRefund && order.payments.some((p) => p.status === "SUCCEEDED" && p.amount > p.refundedAmount) ? (
              <CardBody className="border-t border-line">
                <h3 className="mb-3 text-sm font-semibold">{t("استرداد مبلغ")}</h3>
                <ActionForm action={refundAction} className="grid gap-3 sm:grid-cols-3" resetOnSuccess>
                  <input type="hidden" name="orderId" value={order.id} />
                  <SelectField label={t("عملية الدفع")} name="paymentId" options={order.payments.filter((p) => p.status === "SUCCEEDED" && p.amount > p.refundedAmount).map((p) => ({ value: p.id, label: t("{0} · متاح {1} ج.م", [t(PAYMENT_METHOD_LABELS[p.method]), ((p.amount - p.refundedAmount) / 100).toFixed(2)]) }))} required />
                  <TextField label={t("المبلغ (ج.م)")} name="amount" inputMode="decimal" dir="ltr" required />
                  <TextField label={t("السبب")} name="reason" required />
                  <div className="sm:col-span-3"><SubmitButton variant="danger" pendingLabel={t("جارٍ الاسترداد…")}>{t("تنفيذ الاسترداد")}</SubmitButton></div>
                </ActionForm>
                <p className="mt-2 text-xs text-ink-muted">{t("يتحقق الخادم من ألا يتجاوز الاسترداد المبلغ المدفوع غير المسترد.")}</p>
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title={t("سجل الطلب")} />
            <CardBody>
              <ol className="relative space-y-4 border-s border-line ps-5">
                {order.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -start-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-sun-400 ring-4 ring-surface" />
                    <p className="text-sm">{t.message(e.message ?? "")}{!e.isPublic ? <Badge tone="neutral" className="ms-2">{t("داخلي")}</Badge> : null}</p>
                    <p className="text-xs text-ink-muted"><DateText value={e.createdAt} withTime /></p>
                  </li>
                ))}
              </ol>
              {canUpdate ? (
                <ActionForm action={noteAction} className="mt-6 space-y-3 border-t border-line pt-4" resetOnSuccess>
                  <input type="hidden" name="orderId" value={order.id} />
                  <TextArea label={t("إضافة ملاحظة")} name="message" rows={2} required />
                  <CheckboxField name="isPublic" label={t("إظهار الملاحظة للعميل في تتبع الطلب")} />
                  <SubmitButton variant="secondary" size="sm">{t("حفظ الملاحظة")}</SubmitButton>
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {(canUpdate || canCancel) && next.length ? (
            <Card>
              <CardHeader title={t("الإجراء التالي")} />
              <CardBody className="space-y-4">
                {next.filter((s) => s !== "CANCELLED" && canUpdate).filter((s) => (s !== "LENS_PREPARATION" && s !== "PRESCRIPTION_REVIEW") || (canRx && order.items.some((i) => i.lensSnapshot))).map((s) => (
                  <ActionForm key={s} action={transitionAction} className="space-y-3 rounded-md border border-line p-3">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="to" value={s} />
                    {s === "SHIPPED" ? (
                      <>
                        <TextField label={t("شركة الشحن")} name="carrier" required />
                        <TextField label={t("رقم التتبع")} name="trackingNumber" dir="ltr" />
                      </>
                    ) : null}
                    {s === "DELIVERED" && awaitingCollection ? <CheckboxField name="collectPayment" label={t("تم تحصيل {0} ج.م من العميل", [(order.total / 100).toFixed(2)])} /> : null}
                    <SubmitButton className="w-full" variant={s === "DELIVERED" ? "primary" : "secondary"}>{t("نقل إلى: {0}", [t(ORDER_STATUS_LABELS[s])])}</SubmitButton>
                  </ActionForm>
                ))}
                {next.includes("CANCELLED") && canCancel ? (
                  <details className="rounded-md border border-danger/30 p-3">
                    <summary className="cursor-pointer text-sm text-danger">{t("إلغاء الطلب")}</summary>
                    <ActionForm action={transitionAction} className="mt-3 space-y-3">
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="to" value="CANCELLED" />
                      <TextArea label={t("سبب الإلغاء")} name="reason" rows={2} required />
                      <p className="text-xs text-ink-muted">{t("يُحرَّر المخزون المحجوز وتُلغى الخصومات ونقاط الولاء. المبالغ المدفوعة تُسترد من قسم المدفوعات.")}</p>
                      <SubmitButton variant="danger" size="sm">{t("تأكيد الإلغاء")}</SubmitButton>
                    </ActionForm>
                  </details>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t("العميل")} />
            <CardBody>
              <DefinitionList
                items={[
                  { label: t("الاسم"), value: order.customer ? <Link className="text-sun-700 hover:underline" href={`/admin/customers/${order.customer.id}`}>{order.contactName}</Link> : t("{0} (زائر)", [order.contactName]) },
                  { label: t("الهاتف"), value: <span className="num" dir="ltr">{order.contactPhone}</span> },
                  { label: t("البريد"), value: order.contactEmail ?? "—" },
                ]}
              />
              {order.customerNote ? <p className="mt-3 rounded-md bg-sun-50 p-3 text-sm">{t("ملاحظة العميل: {0}", [order.customerNote])}</p> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("الاستلام والتنفيذ")} />
            <CardBody>
              <DefinitionList
                items={[
                  { label: t("الطريقة"), value: t(FULFILLMENT_LABELS[order.fulfillmentType]) },
                  { label: t("فرع التنفيذ"), value: order.fulfillmentBranch.name },
                  ...(order.pickupBranch ? [{ label: t("فرع الاستلام"), value: order.pickupBranch.name }] : []),
                  ...(order.shippingMethod ? [{ label: t("الشحن"), value: order.shippingMethod }] : []),
                  { label: t("الدفع"), value: t(PAYMENT_METHOD_LABELS[order.paymentMethod]) },
                ]}
              />
              {addr ? (
                <address className="mt-3 text-sm not-italic leading-6">
                  {addr.fullName} · <span className="num" dir="ltr">{addr.phone}</span><br />
                  {[addr.street, addr.building && t("عمارة {0}", [addr.building]), addr.floor && t("دور {0}", [addr.floor]), addr.apartment && t("شقة {0}", [addr.apartment])].filter(Boolean).join(t("، "))}<br />
                  {[addr.area, addr.city, addr.governorate && t(addr.governorate)].filter(Boolean).join(t("، "))}
                  {addr.landmark ? <><br />{t("علامة مميزة:")}{" "}{addr.landmark}</> : null}
                </address>
              ) : null}
              {order.shipments.map((s) => (
                <p key={s.id} className="mt-3 text-sm">{t("شحنة:")}{" "}{s.carrier} {s.trackingNumber ? <span className="num" dir="ltr">({s.trackingNumber})</span> : null}</p>
              ))}
            </CardBody>
          </Card>

          {order.status === "DELIVERED" && can(actor, "returns.manage", order.fulfillmentBranchId) ? (
            <Card>
              <CardHeader title={t("تسجيل مرتجع")} />
              <CardBody>
                <ActionForm action={staffCreateReturnAction} className="space-y-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  {order.items.map((it, i) => (
                    <div key={it.id} className="flex items-center justify-between gap-2 text-sm">
                      <input type="hidden" name={`items.${i}.orderItemId`} value={it.id} />
                      <span className="min-w-0 truncate">{it.productName}{!it.returnable ? t(" (عدسات مصنّعة)") : ""}</span>
                      <input name={`items.${i}.quantity`} defaultValue={0} inputMode="numeric" dir="ltr" className="h-8 w-16 rounded border border-line-strong px-2" aria-label={t("كمية {0}", [it.productName])} />
                    </div>
                  ))}
                  <SelectField label={t("الحل")} name="resolution" options={[{ value: "REFUND", label: t("استرداد المبلغ") }, { value: "EXCHANGE", label: t("استبدال") }]} />
                  <TextField label={t("السبب")} name="reason" required />
                  <SubmitButton size="sm" variant="secondary">{t("إنشاء طلب إرجاع")}</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {order.returns.length || order.redemptions.length ? (
            <Card>
              <CardHeader title={t("مرتبط")} />
              <CardBody className="space-y-2 text-sm">
                {order.returns.map((r) => (
                  <p key={r.id}><Link className="num text-sun-700 hover:underline" href={`/admin/returns/${r.id}`}>{r.number}</Link> <Badge tone={returnTone[r.status]}>{t(RETURN_STATUS_LABELS[r.status])}</Badge></p>
                ))}
                {order.redemptions.map((r) => (
                  <p key={r.id}>{t("عرض:")}{" "}{r.promotion.name}{r.promotion.code ? ` (${r.promotion.code})` : ""} · <Money value={r.amount} />{r.reversedAt ? t(" · أُلغي") : ""}</p>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-ink-muted" : ""}`}>
      <dt>{label}</dt>
      <dd><Money value={value} /></dd>
    </div>
  );
}
