"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { saveRate, saveZone } from "@/modules/shipping/service";
import { getT } from "@/i18n/server";

type R = ActionResult<unknown> | null;
const optId = (v: unknown) => (typeof v === "string" && v ? v : null);

export async function saveZoneAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  return runAction(async () => {
    const actor = await requireStaff("shipping.write");
    const { id, ...input } = formToObject(form);
    await saveZone(actor, optId(id), { ...input, governorates: input.governorates ?? [] });
    revalidatePath("/admin/shipping");
  }, t("تم حفظ المنطقة"));
}

export async function saveRateAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  return runAction(async () => {
    const actor = await requireStaff("shipping.write");
    const { id, zoneId, ...input } = formToObject(form);
    await saveRate(actor, z.string().min(1).parse(zoneId), optId(id), input);
    revalidatePath("/admin/shipping");
  }, t("تم حفظ سعر الشحن"));
}
