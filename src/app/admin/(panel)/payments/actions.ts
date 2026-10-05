"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { reconcilePayments } from "@/modules/payments/service";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { getT } from "@/i18n/server";

export async function reconcileAction(_p: ActionResult<unknown> | null): Promise<ActionResult<unknown> | null> {
  const t = await getT();
  const res = await runAction(async () => {
    const actor = await requireStaff("payments.reconcile");
    const summary = await reconcilePayments(15);
    await audit(db, actor, { action: "payment.reconcile", entityType: "payment", entityId: "batch", after: summary });
    revalidatePath("/admin/payments");
    return summary;
  });
  if (res.ok) {
    const s = res.data as { checked: number; updated: number; unresolved: number };
    return { ...res, message: t("تم فحص {0} عملية معلقة: حُدِّث {1}، وتبقى {2} للمراجعة اليدوية.", [s.checked, s.updated, s.unresolved]) };
  }
  return res;
}
