"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { adjustStock } from "@/modules/inventory/service";
import { db } from "@/server/db";
import { invalid } from "@/server/errors";
import { getT } from "@/i18n/server";

type R = ActionResult<unknown> | null;

export async function adjustAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  return runAction(async () => {
    const actor = await requireStaff("inventory.adjust");
    const code = String(form.get("sku") ?? "").trim().toUpperCase();
    const variant = code ? await db.productVariant.findFirst({ where: { OR: [{ sku: code }, { barcode: code }] }, select: { id: true } }) : null;
    if (!variant) throw invalid(t("لم يتم العثور على SKU أو باركود مطابق"));
    await adjustStock(actor, {
      branchId: String(form.get("branchId") ?? ""),
      variantId: variant.id,
      mode: form.get("mode") === "count" ? "count" : "delta",
      value: String(form.get("value") ?? "") as never,
      type: (String(form.get("type") ?? "ADJUSTMENT")) as never,
      reason: String(form.get("reason") ?? ""),
    });
    revalidatePath("/admin/inventory");
  }, t("تم تسجيل حركة المخزون"));
}
