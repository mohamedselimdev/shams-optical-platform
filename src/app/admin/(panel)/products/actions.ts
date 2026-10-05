"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToNested, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { saveProduct } from "@/modules/catalog/service";
import { storeUpload, mediaUrl } from "@/server/storage";
import { isDomainError } from "@/server/errors";
import { logger } from "@/server/logger";
import { getT } from "@/i18n/server";

type R = ActionResult<unknown> | null;

export async function saveProductAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  let savedId: string | null = null;
  const result = await runAction(async () => {
    const actor = await requireStaff("catalog.write");
    const { productId, ...input } = formToNested(form);
    const id = typeof productId === "string" && productId ? productId : null;
    const product = await saveProduct(actor, id, input as never);
    savedId = product.id;
    revalidatePath("/admin/products");
    return { created: !id };
  }, t("تم حفظ المنتج"));
  if (result.ok && (result.data as { created: boolean }).created && savedId) redirect(`/admin/products/${savedId}?saved=1`);
  return result;
}

export async function uploadProductImage(form: FormData): Promise<{ ok: true; url: string; mediaId: string } | { ok: false; error: string }> {
  const t = await getT();
  try {
    const actor = await requireStaff("catalog.write");
    const file = form.get("file");
    if (!(file instanceof File)) return { ok: false, error: t("اختر ملفاً") };
    const asset = await storeUpload(file, "product", actor.userId);
    return { ok: true, url: mediaUrl(asset), mediaId: asset.id };
  } catch (e) {
    if (isDomainError(e)) return { ok: false, error: e.message };
    logger.error({ err: e }, "product upload failed");
    return { ok: false, error: t("تعذّر رفع الصورة") };
  }
}
