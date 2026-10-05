"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { formToNested, runAction, type ActionResult } from "@/server/action";
import { requireCustomer } from "@/server/auth/session";
import { cartForWrite } from "@/server/storefront";
import { invalid, unauthenticated } from "@/server/errors";
import { enforceRateLimit } from "@/server/rate-limit";
import { addToCart } from "@/modules/cart/service";
import { priceLensSelection } from "@/modules/lenses/pricing";
import { createPrescription } from "@/modules/prescriptions/service";
import { prescriptionValuesSchema } from "@/modules/prescriptions/schema";
import { submitReview } from "@/modules/reviews/service";
import { toggleWishlist } from "@/modules/customers/service";
import { getT } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";

type R = ActionResult<unknown> | null;

const defaultRxLabel = (t: Translator) => t("وصفة {0}", [t.date(new Date())]);

/**
 * Add a frame (optionally with lenses) to the cart. When the lens type needs a prescription, the
 * prescription is validated against the chosen lens first and only then saved to the customer's account,
 * so a rejected configuration never leaves a stray prescription behind.
 */
export async function addToCartAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  let ok = false;
  const res = await runAction(async () => {
    const d = formToNested(form) as Record<string, unknown> & { rx?: Record<string, unknown>; lensOptionIds?: string[] };
    const { cart, actor } = await cartForWrite();
    const withLens = d.withLens === "1";
    const lensTypeId = withLens ? String(d.lensTypeId ?? "") : "";
    const lensIndexId = withLens ? String(d.lensIndexId ?? "") : "";
    const lensOptionIds = withLens ? (d.lensOptionIds ?? []).map(String) : [];
    let prescriptionMode: "NONE" | "SAVED" | "ENTERED" | "UPLOADED" = "NONE";
    let prescriptionId: string | null = null;

    if (withLens) {
      if (!lensTypeId || !lensIndexId) throw invalid(t("اختر نوع العدسة وسُمكها"));
      const type = await db.lensType.findUnique({ where: { id: lensTypeId }, select: { requiresPrescription: true } });
      if (!type) throw invalid(t("نوع العدسة غير متاح"));
      if (type.requiresPrescription) {
        if (!actor) throw unauthenticated();
        const source = z.enum(["SAVED", "ENTERED", "UPLOADED"]).parse(d.rxSource);
        const label = String(d.rxLabel ?? "").trim() || defaultRxLabel(t);
        if (source === "SAVED") {
          prescriptionId = z.string().min(1, t("اختر الوصفة")).parse(d.prescriptionId);
        } else if (source === "ENTERED") {
          const parsed = prescriptionValuesSchema.safeParse(d.rx ?? {});
          // Re-key issues to the form's "rx." field names so errors render under the right cells.
          if (!parsed.success) throw new z.ZodError(parsed.error.issues.map((i) => ({ ...i, path: ["rx", ...i.path] })));
          const values = parsed.data;
          await priceLensSelection(db, { lensTypeId, lensIndexId, optionIds: lensOptionIds }, values);
          await enforceRateLimit(`rx:create:${actor.customerId}`, 20, 3600);
          prescriptionId = (await createPrescription(actor, { meta: { label }, values })).id;
        } else {
          const file = form.get("rxFile");
          if (!(file instanceof File) || file.size === 0) throw invalid(t("ارفع صورة الوصفة"));
          await priceLensSelection(db, { lensTypeId, lensIndexId, optionIds: lensOptionIds }, null);
          await enforceRateLimit(`rx:create:${actor.customerId}`, 20, 3600);
          prescriptionId = (await createPrescription(actor, { meta: { label }, file })).id;
        }
        prescriptionMode = source;
      }
    }

    await addToCart(cart.id, actor?.customerId ?? null, {
      variantId: String(d.variantId ?? ""),
      quantity: String(d.quantity ?? "1") as never,
      lensTypeId: lensTypeId || undefined,
      lensIndexId: lensIndexId || undefined,
      lensOptionIds,
      prescriptionMode,
      prescriptionId: prescriptionId ?? undefined,
    });
    ok = true;
  });
  if (ok) {
    revalidatePath("/", "layout");
    redirect("/cart");
  }
  return res;
}

export async function toggleWishlistAction(_p: R, form: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireCustomer();
    const added = await toggleWishlist(actor, z.string().min(1).max(64).parse(form.get("productId")));
    revalidatePath(String(form.get("path") ?? "/"));
    return added;
  });
}

export async function reviewAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  return runAction(async () => {
    const actor = await requireCustomer();
    await enforceRateLimit(`review:${actor.customerId}`, 10, 3600);
    await submitReview(actor, Object.fromEntries(form));
  }, t("شكراً لك! سيظهر تقييمك بعد المراجعة."));
}
