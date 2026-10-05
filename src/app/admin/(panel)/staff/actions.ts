"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { createStaff, updateStaff, saveRole } from "@/modules/staff/service";
import { getT } from "@/i18n/server";

type R = ActionResult<unknown> | null;

export async function saveStaffAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  let created: string | null = null;
  const res = await runAction(async () => {
    const actor = await requireStaff("staff.write");
    const { staffId, ...input } = formToObject(form);
    const data = { ...input, roleIds: input.roleIds ?? [], branchIds: input.branchIds ?? [] };
    if (typeof staffId === "string" && staffId) await updateStaff(actor, staffId, data);
    else created = (await createStaff(actor, data)).id;
    revalidatePath("/admin/staff");
  }, t("تم حفظ بيانات الموظف"));
  if (res.ok && created) redirect(`/admin/staff/${created}`);
  return res;
}

export async function saveRoleAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  return runAction(async () => {
    const actor = await requireStaff("roles.write");
    const { id, ...input } = formToObject(form);
    await saveRole(actor, typeof id === "string" && id ? id : null, { ...input, permissions: input.permissions ?? [] });
    revalidatePath("/admin/roles");
  }, t("تم حفظ الدور"));
}
