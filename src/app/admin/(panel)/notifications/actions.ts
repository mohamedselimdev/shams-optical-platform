"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";

export async function markAllReadAction(_p: ActionResult<unknown> | null): Promise<ActionResult<unknown> | null> {
  return runAction(async () => {
    const actor = await requireStaff("notifications.read");
    await db.notification.updateMany({ where: { staffUserId: actor.userId, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/admin", "layout");
  });
}
