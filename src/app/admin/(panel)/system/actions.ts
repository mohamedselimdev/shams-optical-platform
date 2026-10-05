"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { getT } from "@/i18n/server";

export async function retryJobAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown> | null> {
  const t = await getT();
  return runAction(async () => {
    await requireStaff("system.health");
    const id = z.string().min(1).parse(form.get("id"));
    await db.job.updateMany({ where: { id, status: "FAILED" }, data: { status: "PENDING", runAt: new Date(), attempts: 0, lastError: null } });
    revalidatePath("/admin/system");
  }, t("أُعيدت المهمة للطابور"));
}
