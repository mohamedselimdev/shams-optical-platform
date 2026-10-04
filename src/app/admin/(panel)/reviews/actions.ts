"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { moderateReview } from "@/modules/reviews/service";

export async function moderateAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown> | null> {
  return runAction(async () => {
    const actor = await requireStaff("reviews.moderate");
    await moderateReview(actor, z.string().min(1).parse(form.get("id")), z.enum(["APPROVED", "REJECTED"]).parse(form.get("status")));
    revalidatePath("/admin/reviews");
  });
}
