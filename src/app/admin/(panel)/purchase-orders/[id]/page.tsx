import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { getPurchaseOrder } from "@/modules/purchasing/service";
import { loadOr404 } from "@/components/admin/load";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, DateText, DefinitionList, Money, Table, Td, Th } from "@/ui/primitives";
import { PO_STATUS_LABELS } from "@/i18n/labels";
import { poTone } from "@/i18n/tones";
import { poStepAction } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("أمر شراء") };
}

export default async function PoDetail({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("purchasing.read");
  const { id } = await params;
  const po = await loadOr404(() => getPurchaseOrder(actor, id));
  const canWrite = can(actor, "purchasing.write", po.branchId);
  const canReceive = ["SENT", "PARTIALLY_RECEIVED"].includes(po.status) && can(actor, "purchasing.receive", po.branchId);
  return (
    <>
      <PageHeader back={{ href: "/admin/purchase-orders", label: t("أوامر الشراء") }} title={<span className="num">{po.number}</span>} description={`${po.supplier.name} ← ${po.branch.name}`} actions={<Badge tone={poTone[po.status]}>{t(PO_STATUS_LABELS[po.status])}</Badge>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t("البنود")} description={canReceive ? t("أدخل الكميات المستلمة الآن؛ يمكن الاستلام على دفعات.") : undefined} />
          <ActionForm action={poStepAction}>
            <input type="hidden" name="id" value={po.id} />
            <input type="hidden" name="step" value="receive" />
            <Table>
              <thead><tr><Th>{t("المنتج")}</Th><Th>{t("مطلوب")}</Th><Th>{t("مستلم")}</Th><Th>{t("تكلفة الوحدة")}</Th><Th>{t("الإجمالي")}</Th>{canReceive ? <Th>{t("استلام الآن")}</Th> : null}</tr></thead>
              <tbody>
                {po.items.map((it, i) => (
                  <tr key={it.id}>
                    <Td><p>{it.variant.product.name}</p><p className="num text-xs text-ink-muted">{it.variant.sku}</p></Td>
                    <Td className="num">{t.number(it.quantityOrdered)}</Td>
                    <Td className="num">{t.number(it.quantityReceived)}</Td>
                    <Td><Money value={it.unitCost} /></Td>
                    <Td><Money value={it.unitCost * it.quantityOrdered} /></Td>
                    {canReceive ? (
                      <Td>
                        <input type="hidden" name={`items.${i}.poItemId`} value={it.id} />
                        <input name={`items.${i}.quantity`} defaultValue={Math.max(0, it.quantityOrdered - it.quantityReceived)} className="h-8 w-20 rounded border border-line-strong px-2 text-sm" inputMode="numeric" dir="ltr" aria-label={t("الكمية المستلمة")} />
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
            {canReceive ? (
              <CardBody className="space-y-3 border-t border-line">
                <TextField label={t("ملاحظات الاستلام")} name="notes" />
                <SubmitButton>{t("تسجيل استلام البضاعة")}</SubmitButton>
                <p className="text-xs text-ink-muted">{t("يُضاف المخزون للفرع وتُحدَّث تكلفة المتوسط المرجّح لكل صنف.")}</p>
              </CardBody>
            ) : null}
          </ActionForm>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("التفاصيل")} />
            <CardBody>
              <DefinitionList items={[
                { label: t("الإجمالي"), value: <Money value={po.subtotal} /> },
                { label: t("تاريخ الإنشاء"), value: <DateText value={po.createdAt} /> },
                { label: t("التوريد المتوقع"), value: po.expectedAt ? <DateText value={po.expectedAt} /> : "—" },
                { label: t("شروط الدفع"), value: po.supplier.paymentTerms ?? "—" },
              ]} />
              {po.notes ? <p className="mt-3 text-sm text-ink-muted">{po.notes}</p> : null}
            </CardBody>
          </Card>
          {canWrite && ["DRAFT", "SENT"].includes(po.status) ? (
            <Card>
              <CardHeader title={t("الإجراءات")} />
              <CardBody className="space-y-3">
                {po.status === "DRAFT" ? (
                  <ActionForm action={poStepAction}>
                    <input type="hidden" name="id" value={po.id} />
                    <input type="hidden" name="step" value="send" />
                    <SubmitButton className="w-full">{t("تعليم كمُرسل للمورد")}</SubmitButton>
                  </ActionForm>
                ) : null}
                <details className="rounded-md border border-danger/30 p-3">
                  <summary className="cursor-pointer text-sm text-danger">{t("إلغاء أمر الشراء")}</summary>
                  <ActionForm action={poStepAction} className="mt-3 space-y-3">
                    <input type="hidden" name="id" value={po.id} />
                    <input type="hidden" name="step" value="cancel" />
                    <TextArea label={t("السبب")} name="reason" rows={2} required />
                    <SubmitButton variant="danger" size="sm">{t("تأكيد الإلغاء")}</SubmitButton>
                  </ActionForm>
                </details>
              </CardBody>
            </Card>
          ) : null}
          {po.receipts.length ? (
            <Card>
              <CardHeader title={t("سندات الاستلام")} />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {po.receipts.map((r) => (
                    <li key={r.id}><DateText value={r.createdAt} withTime /> · {t.number(r.items.reduce((s, i) => s + i.quantity, 0))} {t("قطعة")}{r.notes ? ` · ${r.notes}` : ""}</li>
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
