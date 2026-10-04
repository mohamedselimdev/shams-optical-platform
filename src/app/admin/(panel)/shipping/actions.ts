"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { saveRate, saveZone } from "@/modules/shipping/service";

type R = ActionResult<unknown> | null;
const optId = (v: unknown) => (typeof v === "string" && v ? v : null);

export async function saveZoneAction(_p: R, form: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireStaff("shipping.write");
    const { id, ...input } = formToObject(form);
    await saveZone(actor, optId(id), { ...input, governorates: input.governorates ?? [] });
    revalidatePath("/admin/shipping");
  }, "تم حفظ المنطقة");
}

export async function saveRateAction(_p: R, form: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireStaff("shipping.write");
    const { id, zoneId, ...input } = formToObject(form);
    await saveRate(actor, z.string().min(1).parse(zoneId), optId(id), input);
    revalidatePath("/admin/shipping");
  }, "تم حفظ سعر الشحن");
}
