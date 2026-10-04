"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formToNested, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { completeReturn, createReturn, inspectReturn, receiveReturn, reviewReturn } from "@/modules/returns/service";

type R = ActionResult<unknown> | null;
const zId = z.string().min(1).max(64);

export async function returnStepAction(_p: R, form: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireStaff("returns.manage");
    const d = formToNested(form) as { id?: string; step?: string; note?: string; branchId?: string; items?: { returnItemId: string; condition?: string; restockDecision: string }[] };
    const id = zId.parse(d.id);
    switch (d.step) {
      case "approve": await reviewReturn(actor, id, "APPROVED", d.note || undefined); break;
      case "reject": await reviewReturn(actor, id, "REJECTED", d.note || undefined); break;
      case "receive": await receiveReturn(actor, id, zId.parse(d.branchId)); break;
      case "inspect": await inspectReturn(actor, id, { items: (d.items ?? []) as never, note: d.note }); break;
      case "complete": await completeReturn(actor, id); break;
      default: throw new Error("unknown step");
    }
    revalidatePath(`/admin/returns/${id}`);
  }, "تم تحديث المرتجع");
}

export async function staffCreateReturnAction(_p: R, form: FormData): Promise<R> {
  let id: string | null = null;
  const res = await runAction(async () => {
    const actor = await requireStaff("returns.manage");
    const d = formToNested(form) as { orderId?: string; reason?: string; resolution?: string; items?: { orderItemId: string; quantity: string }[] };
    const r = await createReturn(actor, { orderId: zId.parse(d.orderId), reason: d.reason ?? "", resolution: d.resolution === "EXCHANGE" ? "EXCHANGE" : "REFUND", items: (d.items ?? []) as never });
    id = r.id;
  });
  if (res.ok && id) redirect(`/admin/returns/${id}`);
  return res;
}
