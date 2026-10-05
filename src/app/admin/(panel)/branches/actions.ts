"use server";

import { revalidatePath } from "next/cache";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { saveBranch } from "@/modules/branches/service";
import { getT } from "@/i18n/server";

export async function saveBranchAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown> | null> {
  const t = await getT();
  return runAction(async () => {
    const actor = await requireStaff("branches.write");
    const { id, ...input } = formToObject(form);
    await saveBranch(actor, typeof id === "string" && id ? id : null, input);
    revalidatePath("/admin/branches");
  }, t("تم حفظ الفرع"));
}
