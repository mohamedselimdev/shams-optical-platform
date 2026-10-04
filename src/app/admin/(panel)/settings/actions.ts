"use server";

import { revalidatePath } from "next/cache";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { saveSettingsFromForm, settingKeySchema } from "@/modules/settings/service";

export async function saveSettingsAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown> | null> {
  return runAction(async () => {
    const actor = await requireStaff("settings.write");
    const { group, ...rest } = formToObject(form);
    await saveSettingsFromForm(actor, settingKeySchema.parse(group), rest);
    revalidatePath("/admin/settings");
  }, "تم حفظ الإعدادات");
}
