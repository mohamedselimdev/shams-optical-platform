"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formToNested, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { cancelPurchaseOrder, createPurchaseOrder, receivePurchaseOrder, sendPurchaseOrder } from "@/modules/purchasing/service";
import { resolveSkuLines } from "@/components/admin/resolve-skus";
import { invalid } from "@/server/errors";
import { getT } from "@/i18n/server";

type R = ActionResult<unknown> | null;

export async function createPoAction(_p: R, form: FormData): Promise<R> {
  let id: string | null = null;
  const res = await runAction(async () => {
    const actor = await requireStaff("purchasing.write");
    const d = formToNested(form);
    const po = await createPurchaseOrder(actor, {
      supplierId: String(d.supplierId ?? ""), branchId: String(d.branchId ?? ""), expectedAt: String(d.expectedAt ?? ""), notes: String(d.notes ?? ""),
      items: (await resolveSkuLines(d.lines)) as never,
    });
    id = po.id;
  });
  if (res.ok && id) redirect(`/admin/purchase-orders/${id}`);
  return res;
}

export async function poStepAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  return runAction(async () => {
    const actor = await requireStaff("purchasing.read");
    const d = formToNested(form) as { id?: string; step?: string; reason?: string; notes?: string; items?: { poItemId: string; quantity: string }[] };
    const id = z.string().min(1).max(64).parse(d.id);
    if (d.step === "send") await sendPurchaseOrder(actor, id);
    else if (d.step === "cancel") {
      if (!d.reason?.trim()) throw invalid(t("سبب الإلغاء مطلوب"));
      await cancelPurchaseOrder(actor, id, d.reason.trim());
    } else if (d.step === "receive") await receivePurchaseOrder(actor, id, { items: (d.items ?? []) as never, notes: d.notes });
    else throw new Error("unknown step");
    revalidatePath(`/admin/purchase-orders/${id}`);
  }, t("تم تحديث أمر الشراء"));
}
