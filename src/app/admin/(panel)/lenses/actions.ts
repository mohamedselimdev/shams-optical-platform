"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formToNested, formToObject, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { saveLensMatrix, saveLensOption, setLensActive } from "@/modules/lenses/admin";

type R = ActionResult<unknown> | null;

export async function saveMatrixAction(_p: R, form: FormData): Promise<R> {
  const res = await runAction(async () => {
    const actor = await requireStaff("lenses.write");
    const d = formToNested(form) as { price?: Record<string, Record<string, string>> };
    const cells: Record<string, string> = {};
    for (const [typeId, row] of Object.entries(d.price ?? {})) for (const [indexId, v] of Object.entries(row)) cells[`${typeId}.${indexId}`] = v;
    const n = await saveLensMatrix(actor, cells);
    revalidatePath("/admin/lenses");
    return n;
  });
  return res.ok ? { ...res, message: `تم حفظ ${res.data} تغيير في الأسعار` } : res;
}

export async function saveOptionAction(_p: R, form: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireStaff("lenses.write");
    const { id, ...input } = formToObject(form);
    await saveLensOption(actor, typeof id === "string" && id ? id : null, { ...input, lensTypeIds: input.lensTypeIds ?? [] });
    revalidatePath("/admin/lenses");
  }, "تم حفظ الخيار");
}

export async function toggleLensAction(_p: R, form: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireStaff("lenses.write");
    await setLensActive(actor, z.enum(["type", "index"]).parse(form.get("kind")), z.string().min(1).parse(form.get("id")), form.get("active") === "1");
    revalidatePath("/admin/lenses");
  });
}
