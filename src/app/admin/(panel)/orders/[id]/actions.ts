"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formToObject, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { addOrderNote, transitionOrder } from "@/modules/orders/service";
import { invalidState } from "@/server/errors";
import { refundPayment } from "@/modules/payments/service";

type R = ActionResult<unknown> | null;
const id = (form: FormData) => z.string().min(1).max(64).parse(form.get("orderId"));

export async function transitionAction(_p: R, form: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireStaff("orders.read");
    const orderId = id(form);
    const { orderId: _o, ...rest } = formToObject(form);
    await transitionOrder(actor, orderId, rest as never);
    revalidatePath(`/admin/orders/${orderId}`);
  }, "تم تحديث حالة الطلب");
}

export async function noteAction(_p: R, form: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireStaff("orders.read");
    const orderId = id(form);
    await addOrderNote(actor, orderId, String(form.get("message") ?? ""), form.get("isPublic") === "on");
    revalidatePath(`/admin/orders/${orderId}`);
  }, "تمت إضافة الملاحظة");
}

export async function refundAction(_p: R, form: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireStaff("payments.refund");
    const orderId = id(form);
    const r = await refundPayment(actor, { paymentId: String(form.get("paymentId") ?? ""), amount: String(form.get("amount") ?? ""), reason: String(form.get("reason") ?? "") } as never);
    revalidatePath(`/admin/orders/${orderId}`);
    if (r.status === "FAILED") throw invalidState("رفض مزود الدفع الاسترداد. لم يُخصم أي مبلغ، راجع سجل المدفوعات.");
  }, "تم تنفيذ الاسترداد");
}
