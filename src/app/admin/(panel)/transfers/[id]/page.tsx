import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { getTransfer } from "@/modules/transfers/service";
import { loadOr404 } from "@/components/admin/load";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, DateText, Table, Td, Th, numberFmt } from "@/ui/primitives";
import { TRANSFER_STATUS_LABELS } from "@/i18n/labels";
import { transferTone } from "@/i18n/tones";
import { transferStepAction } from "../actions";

export const metadata = { title: "تحويل مخزون" };

export default async function TransferDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaffPage("inventory.read");
  const { id } = await params;
  const t = await loadOr404(() => getTransfer(actor, id));
  const canApprove = t.status === "DRAFT" && can(actor, "transfers.approve", t.fromBranchId);
  const canShip = t.status === "APPROVED" && can(actor, "transfers.ship", t.fromBranchId);
  const canReceive = t.status === "IN_TRANSIT" && can(actor, "transfers.receive", t.toBranchId);
  const canCancel = (t.status === "DRAFT" || t.status === "APPROVED") && (can(actor, "transfers.approve", t.fromBranchId) || can(actor, "transfers.create", t.fromBranchId));
  const cell = "h-8 w-20 rounded border border-line-strong px-2 text-sm";
  const lineForm = canShip || canReceive;
  return (
    <>
      <PageHeader back={{ href: "/admin/transfers", label: "التحويلات" }} title={<span className="num">{t.number}</span>} description={`${t.fromBranch.name} ← ${t.toBranch.name}`} actions={<Badge tone={transferTone[t.status]}>{TRANSFER_STATUS_LABELS[t.status]}</Badge>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="البنود" />
          <ActionForm action={transferStepAction}>
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="step" value={canShip ? "ship" : "receive"} />
            <Table>
              <thead><tr><Th>المنتج</Th><Th>المطلوب</Th><Th>المشحون</Th><Th>المستلم</Th>{canReceive ? <Th>سبب الفرق</Th> : null}</tr></thead>
              <tbody>
                {t.items.map((it, i) => (
                  <tr key={it.id}>
                    <Td><p>{it.variant.product.name}</p><p className="num text-xs text-ink-muted">{it.variant.sku}</p><input type="hidden" name={`items.${i}.itemId`} value={it.id} /></Td>
                    <Td className="num">{numberFmt.format(it.quantityRequested)}</Td>
                    <Td>{canShip ? <input name={`items.${i}.quantityShipped`} defaultValue={it.quantityRequested} className={cell} inputMode="numeric" dir="ltr" aria-label="الكمية المشحونة" /> : <span className="num">{numberFmt.format(it.quantityShipped)}</span>}</Td>
                    <Td>{canReceive ? <input name={`items.${i}.quantityReceived`} defaultValue={it.quantityShipped} className={cell} inputMode="numeric" dir="ltr" aria-label="الكمية المستلمة" /> : <span className="num">{numberFmt.format(it.quantityReceived)}</span>}{it.discrepancyReason ? <span className="block text-xs text-clay">{it.discrepancyReason}</span> : null}</Td>
                    {canReceive ? <Td><input name={`items.${i}.discrepancyReason`} className="h-8 w-full rounded border border-line-strong px-2 text-sm" aria-label="سبب الفرق" /></Td> : null}
                  </tr>
                ))}
              </tbody>
            </Table>
            {lineForm ? (
              <CardBody className="space-y-3 border-t border-line">
                <TextField label="ملاحظة" name="note" />
                <SubmitButton>{canShip ? "تأكيد الشحن (خصم من المصدر)" : "تأكيد الاستلام (إضافة للوجهة)"}</SubmitButton>
              </CardBody>
            ) : null}
          </ActionForm>
        </Card>
        <div className="space-y-6">
          {canApprove || canCancel ? (
            <Card>
              <CardHeader title="الإجراءات" />
              <CardBody className="space-y-3">
                {canApprove ? (
                  <ActionForm action={transferStepAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="step" value="approve" />
                    <SubmitButton className="w-full">اعتماد التحويل</SubmitButton>
                  </ActionForm>
                ) : null}
                {canCancel ? (
                  <details className="rounded-md border border-danger/30 p-3">
                    <summary className="cursor-pointer text-sm text-danger">إلغاء التحويل</summary>
                    <ActionForm action={transferStepAction} className="mt-3 space-y-3">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="step" value="cancel" />
                      <TextArea label="السبب" name="reason" rows={2} required />
                      <SubmitButton variant="danger" size="sm">تأكيد الإلغاء</SubmitButton>
                    </ActionForm>
                  </details>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="السجل" />
            <CardBody>
              <ol className="space-y-3 text-sm">
                {t.events.map((e) => (
                  <li key={e.id}>
                    <Badge tone={transferTone[e.toStatus]}>{TRANSFER_STATUS_LABELS[e.toStatus]}</Badge> <DateText value={e.createdAt} withTime />
                    {e.note ? <p className="mt-1 text-ink-muted">{e.note}</p> : null}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
