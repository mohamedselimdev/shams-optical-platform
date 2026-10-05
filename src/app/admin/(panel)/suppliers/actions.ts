"use server";

import { revalidatePath } from "next/cache";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { saveSupplier } from "@/modules/suppliers/service";
import { getT } from "@/i18n/server";

export async function saveSupplierAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown> | null> {
  const t = await getT();
  return runAction(async () => {
    const actor = await requireStaff("suppliers.write");
    const { id, ...input } = formToObject(form);
    await saveSupplier(actor, typeof id === "string" && id ? id : null, input);
    revalidatePath("/admin/suppliers");
  }, t("تم حفظ المورد"));
}
