"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { saveTaxonomy } from "@/modules/catalog/service";

export async function saveTaxonomyAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown> | null> {
  return runAction(async () => {
    const actor = await requireStaff("catalog.write");
    const { id, kind, ...input } = formToObject(form);
    await saveTaxonomy(actor, z.enum(["category", "brand", "collection"]).parse(kind), typeof id === "string" && id ? id : null, input);
    revalidatePath("/admin/taxonomy");
  }, "تم الحفظ");
}
