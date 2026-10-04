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
import { Badge, Card, CardBody, CardHeader, DateText, DefinitionList, Money, Table, Td, Th, numberFmt } from "@/ui/primitives";
import { RESTOCK_LABELS, RETURN_RESOLUTION_LABELS, RETURN_STATUS_LABELS } from "@/i18n/labels";
import { returnTone } from "@/i18n/tones";
import { returnStepAction } from "../actions";

export const metadata = { title: "طلب إرجاع" };

export default async function ReturnDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaffPage("returns.read");
  const { id } = await params;
  const r = await loadOr404(() => getReturnForStaff(actor, id));
  const manage = can(actor, "returns.manage", r.order.fulfillmentBranchId);
  const branches = manage && r.status === "APPROVED" ? await actorBranches(actor) : [];
  const hidden = (step: string) => (<><input type="hidden" name="id" value={r.id} /><input type="hidden" name="step" value={step} /></>);
  return (
    <>
      <PageHeader back={{ href: "/admin/returns", label: "المرتجعات" }} title={<span className="num">{r.number}</span>} description={<>طلب <Link className="num text-sun-700 hover:underline" href={`/admin/orders/${r.order.id}`}>{r.order.number}</Link> · {RETURN_RESOLUTION_LABELS[r.resolution]}</>} actions={<Badge tone={returnTone[r.status]}>{RETURN_STATUS_LABELS[r.status]}</Badge>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="المنتجات المرتجعة" />
          <ActionForm action={returnStepAction}>
            {hidden("inspect")}
            <Table>
              <thead><tr><Th>المنتج</Th><Th>الكمية</Th><Th>سبب العميل</Th><Th>الفحص</Th></tr></thead>
              <tbody>
                {r.items.map((it, i) => (
                  <tr key={it.id}>
                    <Td><p>{it.orderItem.productName}</p><p className="num text-xs text-ink-muted">{it.orderItem.sku}</p></Td>
                    <Td className="num">{numberFmt.format(it.quantity)} من {numberFmt.format(it.orderItem.quantity)}</Td>
                    <Td className="text-xs">{it.reason ?? "—"}</Td>
                    <Td>
                      {r.status === "RECEIVED" && manage ? (
                        <div className="flex gap-2">
                          <input type="hidden" name={`items.${i}.returnItemId`} value={it.id} />
                          <select name={`items.${i}.restockDecision`} className="h-8 rounded border border-line-strong px-1 text-sm" aria-label="قرار الفحص">
                            {Object.entries(RESTOCK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <input name={`items.${i}.condition`} placeholder="الحالة" className="h-8 w-32 rounded border border-line-strong px-2 text-sm" aria-label="حالة المنتج" />
                        </div>
                      ) : it.restockDecision ? `${RESTOCK_LABELS[it.restockDecision]}${it.condition ? ` · ${it.condition}` : ""}` : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {r.status === "RECEIVED" && manage ? (
              <CardBody className="space-y-3 border-t border-line">
                <TextField label="ملاحظة الفحص" name="note" />
                <SubmitButton>حفظ نتيجة الفحص</SubmitButton>
                <p className="text-xs text-ink-muted">كل قطعة تعود لدفتر المخزون؛ التالف يُشطب بحركة منفصلة للتتبع.</p>
              </CardBody>
            ) : null}
          </ActionForm>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="التفاصيل" />
            <CardBody>
              <DefinitionList items={[
                { label: "العميل", value: r.customer ? <Link className="text-sun-700 hover:underline" href={`/admin/customers/${r.customer.id}`}>{r.customer.firstName} {r.customer.lastName ?? ""}</Link> : "زائر" },
                { label: "السبب", value: r.reason },
                ...(r.customerNote ? [{ label: "ملاحظة العميل", value: r.customerNote }] : []),
                { label: "فرع الاستلام", value: r.branch?.name ?? "—" },
                { label: r.status === "COMPLETED" ? "المبلغ المسترد" : "الاسترداد المتوقع", value: <Money value={r.status === "COMPLETED" ? r.refundAmount : r.estimatedRefund} /> },
              ]} />
            </CardBody>
          </Card>
          {manage && ["REQUESTED", "APPROVED", "INSPECTED"].includes(r.status) ? (
            <Card>
              <CardHeader title="الإجراء التالي" />
              <CardBody className="space-y-3">
                {r.status === "REQUESTED" ? (
                  <ActionForm action={returnStepAction} className="space-y-3">
                    <input type="hidden" name="id" value={r.id} />
                    <TextArea label="ملاحظة (مطلوبة عند الرفض)" name="note" rows={2} />
                    <div className="flex gap-2">
                      <SubmitButton name="step" value="approve">قبول الطلب</SubmitButton>
                      <SubmitButton name="step" value="reject" variant="danger">رفض</SubmitButton>
                    </div>
                  </ActionForm>
                ) : null}
                {r.status === "APPROVED" ? (
                  <ActionForm action={returnStepAction} className="space-y-3">
                    {hidden("receive")}
                    <SelectField label="استُلم في فرع" name="branchId" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
                    <SubmitButton>تأكيد استلام المنتجات</SubmitButton>
                  </ActionForm>
                ) : null}
                {r.status === "INSPECTED" ? (
                  <ActionForm action={returnStepAction} className="space-y-2">
                    {hidden("complete")}
                    <SubmitButton className="w-full">{r.resolution === "REFUND" ? <>إتمام واسترداد <Money value={r.estimatedRefund} /></> : "إتمام الاستبدال"}</SubmitButton>
                    <p className="text-xs text-ink-muted">الاسترداد لا يتجاوز المدفوع غير المسترد ويُخصم من نقاط الولاء المكتسبة نسبياً.</p>
                  </ActionForm>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="السجل" />
            <CardBody>
              <ol className="space-y-2 text-sm">
                {r.events.map((e) => <li key={e.id}><Badge tone={returnTone[e.toStatus]}>{RETURN_STATUS_LABELS[e.toStatus]}</Badge> <DateText value={e.createdAt} withTime />{e.note ? <p className="text-ink-muted">{e.note}</p> : null}</li>)}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
