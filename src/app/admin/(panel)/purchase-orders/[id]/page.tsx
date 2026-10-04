import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { getPurchaseOrder } from "@/modules/purchasing/service";
import { loadOr404 } from "@/components/admin/load";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, DateText, DefinitionList, Money, Table, Td, Th, numberFmt } from "@/ui/primitives";
import { PO_STATUS_LABELS } from "@/i18n/labels";
import { poTone } from "@/i18n/tones";
import { poStepAction } from "../actions";

export const metadata = { title: "أمر شراء" };

export default async function PoDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaffPage("purchasing.read");
  const { id } = await params;
  const po = await loadOr404(() => getPurchaseOrder(actor, id));
  const canWrite = can(actor, "purchasing.write", po.branchId);
  const canReceive = ["SENT", "PARTIALLY_RECEIVED"].includes(po.status) && can(actor, "purchasing.receive", po.branchId);
  return (
    <>
      <PageHeader back={{ href: "/admin/purchase-orders", label: "أوامر الشراء" }} title={<span className="num">{po.number}</span>} description={`${po.supplier.name} ← ${po.branch.name}`} actions={<Badge tone={poTone[po.status]}>{PO_STATUS_LABELS[po.status]}</Badge>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="البنود" description={canReceive ? "أدخل الكميات المستلمة الآن؛ يمكن الاستلام على دفعات." : undefined} />
          <ActionForm action={poStepAction}>
            <input type="hidden" name="id" value={po.id} />
            <input type="hidden" name="step" value="receive" />
            <Table>
              <thead><tr><Th>المنتج</Th><Th>مطلوب</Th><Th>مستلم</Th><Th>تكلفة الوحدة</Th><Th>الإجمالي</Th>{canReceive ? <Th>استلام الآن</Th> : null}</tr></thead>
              <tbody>
                {po.items.map((it, i) => (
                  <tr key={it.id}>
                    <Td><p>{it.variant.product.name}</p><p className="num text-xs text-ink-muted">{it.variant.sku}</p></Td>
                    <Td className="num">{numberFmt.format(it.quantityOrdered)}</Td>
                    <Td className="num">{numberFmt.format(it.quantityReceived)}</Td>
                    <Td><Money value={it.unitCost} /></Td>
                    <Td><Money value={it.unitCost * it.quantityOrdered} /></Td>
                    {canReceive ? (
                      <Td>
                        <input type="hidden" name={`items.${i}.poItemId`} value={it.id} />
                        <input name={`items.${i}.quantity`} defaultValue={Math.max(0, it.quantityOrdered - it.quantityReceived)} className="h-8 w-20 rounded border border-line-strong px-2 text-sm" inputMode="numeric" dir="ltr" aria-label="الكمية المستلمة" />
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
            {canReceive ? (
              <CardBody className="space-y-3 border-t border-line">
                <TextField label="ملاحظات الاستلام" name="notes" />
                <SubmitButton>تسجيل استلام البضاعة</SubmitButton>
                <p className="text-xs text-ink-muted">يُضاف المخزون للفرع وتُحدَّث تكلفة المتوسط المرجّح لكل صنف.</p>
              </CardBody>
            ) : null}
          </ActionForm>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="التفاصيل" />
            <CardBody>
              <DefinitionList items={[
                { label: "الإجمالي", value: <Money value={po.subtotal} /> },
                { label: "تاريخ الإنشاء", value: <DateText value={po.createdAt} /> },
                { label: "التوريد المتوقع", value: po.expectedAt ? <DateText value={po.expectedAt} /> : "—" },
                { label: "شروط الدفع", value: po.supplier.paymentTerms ?? "—" },
              ]} />
              {po.notes ? <p className="mt-3 text-sm text-ink-muted">{po.notes}</p> : null}
            </CardBody>
          </Card>
          {canWrite && ["DRAFT", "SENT"].includes(po.status) ? (
            <Card>
              <CardHeader title="الإجراءات" />
              <CardBody className="space-y-3">
                {po.status === "DRAFT" ? (
                  <ActionForm action={poStepAction}>
                    <input type="hidden" name="id" value={po.id} />
                    <input type="hidden" name="step" value="send" />
                    <SubmitButton className="w-full">تعليم كمُرسل للمورد</SubmitButton>
                  </ActionForm>
                ) : null}
                <details className="rounded-md border border-danger/30 p-3">
                  <summary className="cursor-pointer text-sm text-danger">إلغاء أمر الشراء</summary>
                  <ActionForm action={poStepAction} className="mt-3 space-y-3">
                    <input type="hidden" name="id" value={po.id} />
                    <input type="hidden" name="step" value="cancel" />
                    <TextArea label="السبب" name="reason" rows={2} required />
                    <SubmitButton variant="danger" size="sm">تأكيد الإلغاء</SubmitButton>
                  </ActionForm>
                </details>
              </CardBody>
            </Card>
          ) : null}
          {po.receipts.length ? (
            <Card>
              <CardHeader title="سندات الاستلام" />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {po.receipts.map((r) => (
                    <li key={r.id}><DateText value={r.createdAt} withTime /> · {numberFmt.format(r.items.reduce((s, i) => s + i.quantity, 0))} قطعة{r.notes ? ` · ${r.notes}` : ""}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
