"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { savePromotion } from "@/modules/promotions/service";
import { cairoLocalToDate } from "@/lib/cairo-time";
import { getT } from "@/i18n/server";

export async function savePromotionAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown> | null> {
  const t = await getT();
  let createdId: string | null = null;
  const res = await runAction(async () => {
    const actor = await requireStaff("promotions.write");
    const { id, startsAt, endsAt, ...input } = formToObject(form);
    const isNew = !(typeof id === "string" && id);
    const p = await savePromotion(actor, isNew ? null : String(id), {
      ...input,
      targetIds: input.targetIds ?? [],
      // datetime-local inputs are Cairo wall-clock times.
      startsAt: startsAt ? cairoLocalToDate(String(startsAt))?.toISOString() ?? "" : "",
      endsAt: endsAt ? cairoLocalToDate(String(endsAt))?.toISOString() ?? "" : "",
    });
    if (isNew) createdId = p.id;
    revalidatePath("/admin/promotions");
  }, t("تم حفظ العرض"));
  if (res.ok && createdId) redirect(`/admin/promotions/${createdId}`);
  return res;
}
