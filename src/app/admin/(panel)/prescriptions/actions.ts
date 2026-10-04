"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { invalid } from "@/server/errors";
import { reviewPrescription } from "@/modules/prescriptions/service";

export async function reviewRxAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown> | null> {
  return runAction(async () => {
    const actor = await requireStaff("prescriptions.review");
    const { id, decision, note, transcribe, ...values } = formToObject(form);
    const rxId = z.string().min(1).max(64).parse(id);
    const d = z.enum(["VERIFIED", "REJECTED"]).parse(decision);
    if (d === "REJECTED" && !String(note ?? "").trim()) throw invalid("اذكر سبب الرفض للعميل في الملاحظة");
    await reviewPrescription(actor, rxId, { decision: d, note: String(note ?? "").trim() || undefined, values: transcribe === "1" && d === "VERIFIED" ? values : undefined });
    revalidatePath(`/admin/prescriptions/${rxId}`);
  }, "تم حفظ المراجعة");
}
