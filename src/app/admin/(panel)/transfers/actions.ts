"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formToNested, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { approveTransfer, cancelTransfer, createTransfer, receiveTransfer, shipTransfer } from "@/modules/transfers/service";
import { resolveSkuLines } from "@/components/admin/resolve-skus";
import { getT } from "@/i18n/server";

type R = ActionResult<unknown> | null;
const zId = z.string().min(1).max(64);

export async function createTransferAction(_p: R, form: FormData): Promise<R> {
  let id: string | null = null;
  const res = await runAction(async () => {
    const actor = await requireStaff("transfers.create");
    const data = formToNested(form);
    const transfer = await createTransfer(actor, { fromBranchId: String(data.fromBranchId ?? ""), toBranchId: String(data.toBranchId ?? ""), notes: String(data.notes ?? ""), items: await resolveSkuLines(data.lines) });
    id = transfer.id;
  });
  if (res.ok && id) redirect(`/admin/transfers/${id}`);
  return res;
}

export async function transferStepAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  return runAction(async () => {
    const actor = await requireStaff("inventory.read");
    const data = formToNested(form) as { id?: string; step?: string; note?: string; reason?: string; items?: { itemId: string; quantityShipped?: string; quantityReceived?: string; discrepancyReason?: string }[] };
    const id = zId.parse(data.id);
    if (data.step === "approve") await approveTransfer(actor, id);
    else if (data.step === "ship") await shipTransfer(actor, id, { items: data.items?.map((i) => ({ itemId: i.itemId, quantityShipped: i.quantityShipped ?? "0" })) as never, note: data.note });
    else if (data.step === "receive") await receiveTransfer(actor, id, { items: (data.items ?? []).map((i) => ({ itemId: i.itemId, quantityReceived: i.quantityReceived ?? "0", discrepancyReason: i.discrepancyReason })) as never, note: data.note });
    else if (data.step === "cancel") await cancelTransfer(actor, id, String(data.reason ?? ""));
    else throw new Error("unknown step");
    revalidatePath(`/admin/transfers/${id}`);
  }, t("تم تحديث التحويل"));
}
