"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { addCustomerNote } from "@/modules/customers/service";
import { adjustLoyalty } from "@/modules/loyalty/service";
import { getT } from "@/i18n/server";

type R = ActionResult<unknown> | null;

export async function customerNoteAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  return runAction(async () => {
    const actor = await requireStaff("customers.notes");
    const id = z.string().min(1).max(64).parse(form.get("customerId"));
    await addCustomerNote(actor, id, String(form.get("body") ?? ""));
    revalidatePath(`/admin/customers/${id}`);
  }, t("تمت إضافة الملاحظة"));
}

export async function loyaltyAdjustAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  return runAction(async () => {
    const actor = await requireStaff("loyalty.adjust");
    const id = z.string().min(1).max(64).parse(form.get("customerId"));
    const points = z.coerce.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, t("أدخل عدد النقاط")).parse(form.get("points"));
    await adjustLoyalty(actor, id, points, String(form.get("reason") ?? ""));
    revalidatePath(`/admin/customers/${id}`);
  }, t("تم تعديل النقاط"));
}
