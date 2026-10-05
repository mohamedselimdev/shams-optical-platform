import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { getTransfer } from "@/modules/transfers/service";
import { loadOr404 } from "@/components/admin/load";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, DateText, Table, Td, Th } from "@/ui/primitives";
import { TRANSFER_STATUS_LABELS } from "@/i18n/labels";
import { transferTone } from "@/i18n/tones";
import { transferStepAction } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("تحويل مخزون") };
}

export default async function TransferDetail({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("inventory.read");
  const { id } = await params;
  const transfer = await loadOr404(() => getTransfer(actor, id));
  const canApprove = transfer.status === "DRAFT" && can(actor, "transfers.approve", transfer.fromBranchId);
  const canShip = transfer.status === "APPROVED" && can(actor, "transfers.ship", transfer.fromBranchId);
  const canReceive = transfer.status === "IN_TRANSIT" && can(actor, "transfers.receive", transfer.toBranchId);
  const canCancel = (transfer.status === "DRAFT" || transfer.status === "APPROVED") && (can(actor, "transfers.approve", transfer.fromBranchId) || can(actor, "transfers.create", transfer.fromBranchId));
  const cell = "h-8 w-20 rounded border border-line-strong px-2 text-sm";
  const lineForm = canShip || canReceive;
  return (
    <>
      <PageHeader back={{ href: "/admin/transfers", label: t("التحويلات") }} title={<span className="num">{transfer.number}</span>} description={`${transfer.fromBranch.name} ← ${transfer.toBranch.name}`} actions={<Badge tone={transferTone[transfer.status]}>{t(TRANSFER_STATUS_LABELS[transfer.status])}</Badge>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t("البنود")} />
          <ActionForm action={transferStepAction}>
            <input type="hidden" name="id" value={transfer.id} />
            <input type="hidden" name="step" value={canShip ? "ship" : "receive"} />
            <Table>
              <thead><tr><Th>{t("المنتج")}</Th><Th>{t("المطلوب")}</Th><Th>{t("المشحون")}</Th><Th>{t("المستلم")}</Th>{canReceive ? <Th>{t("سبب الفرق")}</Th> : null}</tr></thead>
              <tbody>
                {transfer.items.map((it, i) => (
                  <tr key={it.id}>
                    <Td><p>{it.variant.product.name}</p><p className="num text-xs text-ink-muted">{it.variant.sku}</p><input type="hidden" name={`items.${i}.itemId`} value={it.id} /></Td>
                    <Td className="num">{t.number(it.quantityRequested)}</Td>
                    <Td>{canShip ? <input name={`items.${i}.quantityShipped`} defaultValue={it.quantityRequested} className={cell} inputMode="numeric" dir="ltr" aria-label={t("الكمية المشحونة")} /> : <span className="num">{t.number(it.quantityShipped)}</span>}</Td>
                    <Td>{canReceive ? <input name={`items.${i}.quantityReceived`} defaultValue={it.quantityShipped} className={cell} inputMode="numeric" dir="ltr" aria-label={t("الكمية المستلمة")} /> : <span className="num">{t.number(it.quantityReceived)}</span>}{it.discrepancyReason ? <span className="block text-xs text-clay">{it.discrepancyReason}</span> : null}</Td>
                    {canReceive ? <Td><input name={`items.${i}.discrepancyReason`} className="h-8 w-full rounded border border-line-strong px-2 text-sm" aria-label={t("سبب الفرق")} /></Td> : null}
                  </tr>
                ))}
              </tbody>
            </Table>
            {lineForm ? (
              <CardBody className="space-y-3 border-t border-line">
                <TextField label={t("ملاحظة")} name="note" />
                <SubmitButton>{canShip ? t("تأكيد الشحن (خصم من المصدر)") : t("تأكيد الاستلام (إضافة للوجهة)")}</SubmitButton>
              </CardBody>
            ) : null}
          </ActionForm>
        </Card>
        <div className="space-y-6">
          {canApprove || canCancel ? (
            <Card>
              <CardHeader title={t("الإجراءات")} />
              <CardBody className="space-y-3">
                {canApprove ? (
                  <ActionForm action={transferStepAction}>
                    <input type="hidden" name="id" value={transfer.id} />
                    <input type="hidden" name="step" value="approve" />
                    <SubmitButton className="w-full">{t("اعتماد التحويل")}</SubmitButton>
                  </ActionForm>
                ) : null}
                {canCancel ? (
                  <details className="rounded-md border border-danger/30 p-3">
                    <summary className="cursor-pointer text-sm text-danger">{t("إلغاء التحويل")}</summary>
                    <ActionForm action={transferStepAction} className="mt-3 space-y-3">
                      <input type="hidden" name="id" value={transfer.id} />
                      <input type="hidden" name="step" value="cancel" />
                      <TextArea label={t("السبب")} name="reason" rows={2} required />
                      <SubmitButton variant="danger" size="sm">{t("تأكيد الإلغاء")}</SubmitButton>
                    </ActionForm>
                  </details>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title={t("السجل")} />
            <CardBody>
              <ol className="space-y-3 text-sm">
                {transfer.events.map((e) => (
                  <li key={e.id}>
                    <Badge tone={transferTone[e.toStatus]}>{t(TRANSFER_STATUS_LABELS[e.toStatus])}</Badge> <DateText value={e.createdAt} withTime />
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
