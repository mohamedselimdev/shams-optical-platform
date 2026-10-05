import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { getReturnForStaff } from "@/modules/returns/service";
import { loadOr404 } from "@/components/admin/load";
import { PageHeader } from "@/components/admin/page-header";
import { actorBranches } from "@/components/admin/range";
import { ActionForm } from "@/ui/action-form";
import { SelectField, TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, DateText, DefinitionList, Money, Table, Td, Th } from "@/ui/primitives";
import { RESTOCK_LABELS, RETURN_RESOLUTION_LABELS, RETURN_STATUS_LABELS } from "@/i18n/labels";
import { returnTone } from "@/i18n/tones";
import { returnStepAction } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("طلب إرجاع") };
}

export default async function ReturnDetail({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("returns.read");
  const { id } = await params;
  const r = await loadOr404(() => getReturnForStaff(actor, id));
  const manage = can(actor, "returns.manage", r.order.fulfillmentBranchId);
  const branches = manage && r.status === "APPROVED" ? await actorBranches(actor) : [];
  const hidden = (step: string) => (<><input type="hidden" name="id" value={r.id} /><input type="hidden" name="step" value={step} /></>);
  return (
    <>
      <PageHeader back={{ href: "/admin/returns", label: t("المرتجعات") }} title={<span className="num">{r.number}</span>} description={<>{t("طلب")}{" "}<Link className="num text-sun-700 hover:underline" href={`/admin/orders/${r.order.id}`}>{r.order.number}</Link> · {t(RETURN_RESOLUTION_LABELS[r.resolution])}</>} actions={<Badge tone={returnTone[r.status]}>{t(RETURN_STATUS_LABELS[r.status])}</Badge>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t("المنتجات المرتجعة")} />
          <ActionForm action={returnStepAction}>
            {hidden("inspect")}
            <Table>
              <thead><tr><Th>{t("المنتج")}</Th><Th>{t("الكمية")}</Th><Th>{t("سبب العميل")}</Th><Th>{t("الفحص")}</Th></tr></thead>
              <tbody>
                {r.items.map((it, i) => (
                  <tr key={it.id}>
                    <Td><p>{it.orderItem.productName}</p><p className="num text-xs text-ink-muted">{it.orderItem.sku}</p></Td>
                    <Td className="num">{t("{0} من {1}", [t.number(it.quantity), t.number(it.orderItem.quantity)])}</Td>
                    <Td className="text-xs">{it.reason ? t(it.reason) : "—"}</Td>
                    <Td>
                      {r.status === "RECEIVED" && manage ? (
                        <div className="flex gap-2">
                          <input type="hidden" name={`items.${i}.returnItemId`} value={it.id} />
                          <select name={`items.${i}.restockDecision`} className="h-8 rounded border border-line-strong px-1 text-sm" aria-label={t("قرار الفحص")}>
                            {Object.entries(RESTOCK_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
                          </select>
                          <input name={`items.${i}.condition`} placeholder={t("الحالة")} className="h-8 w-32 rounded border border-line-strong px-2 text-sm" aria-label={t("حالة المنتج")} />
                        </div>
                      ) : it.restockDecision ? `${t(RESTOCK_LABELS[it.restockDecision])}${it.condition ? ` · ${it.condition}` : ""}` : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {r.status === "RECEIVED" && manage ? (
              <CardBody className="space-y-3 border-t border-line">
                <TextField label={t("ملاحظة الفحص")} name="note" />
                <SubmitButton>{t("حفظ نتيجة الفحص")}</SubmitButton>
                <p className="text-xs text-ink-muted">{t("كل قطعة تعود لدفتر المخزون؛ التالف يُشطب بحركة منفصلة للتتبع.")}</p>
              </CardBody>
            ) : null}
          </ActionForm>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("التفاصيل")} />
            <CardBody>
              <DefinitionList items={[
                { label: t("العميل"), value: r.customer ? <Link className="text-sun-700 hover:underline" href={`/admin/customers/${r.customer.id}`}>{r.customer.firstName} {r.customer.lastName ?? ""}</Link> : t("زائر") },
                { label: t("السبب"), value: r.reason && t(r.reason) },
                ...(r.customerNote ? [{ label: t("ملاحظة العميل"), value: r.customerNote }] : []),
                { label: t("فرع الاستلام"), value: r.branch?.name ?? "—" },
                { label: r.status === "COMPLETED" ? t("المبلغ المسترد") : t("الاسترداد المتوقع"), value: <Money value={r.status === "COMPLETED" ? r.refundAmount : r.estimatedRefund} /> },
              ]} />
            </CardBody>
          </Card>
          {manage && ["REQUESTED", "APPROVED", "INSPECTED"].includes(r.status) ? (
            <Card>
              <CardHeader title={t("الإجراء التالي")} />
              <CardBody className="space-y-3">
                {r.status === "REQUESTED" ? (
                  <ActionForm action={returnStepAction} className="space-y-3">
                    <input type="hidden" name="id" value={r.id} />
                    <TextArea label={t("ملاحظة (مطلوبة عند الرفض)")} name="note" rows={2} />
                    <div className="flex gap-2">
                      <SubmitButton name="step" value="approve">{t("قبول الطلب")}</SubmitButton>
                      <SubmitButton name="step" value="reject" variant="danger">{t("رفض")}</SubmitButton>
                    </div>
                  </ActionForm>
                ) : null}
                {r.status === "APPROVED" ? (
                  <ActionForm action={returnStepAction} className="space-y-3">
                    {hidden("receive")}
                    <SelectField label={t("استُلم في فرع")} name="branchId" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
                    <SubmitButton>{t("تأكيد استلام المنتجات")}</SubmitButton>
                  </ActionForm>
                ) : null}
                {r.status === "INSPECTED" ? (
                  <ActionForm action={returnStepAction} className="space-y-2">
                    {hidden("complete")}
                    <SubmitButton className="w-full">{r.resolution === "REFUND" ? <>{t("إتمام واسترداد")}{" "}<Money value={r.estimatedRefund} /></> : t("إتمام الاستبدال")}</SubmitButton>
                    <p className="text-xs text-ink-muted">{t("الاسترداد لا يتجاوز المدفوع غير المسترد ويُخصم من نقاط الولاء المكتسبة نسبياً.")}</p>
                  </ActionForm>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title={t("السجل")} />
            <CardBody>
              <ol className="space-y-2 text-sm">
                {r.events.map((e) => <li key={e.id}><Badge tone={returnTone[e.toStatus]}>{t(RETURN_STATUS_LABELS[e.toStatus])}</Badge> <DateText value={e.createdAt} withTime />{e.note ? <p className="text-ink-muted">{e.note}</p> : null}</li>)}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
