"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/server/auth/auth";
import { formToNested, formToObject, runAction, type ActionResult } from "@/server/action";
import { requireCustomer } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/rate-limit";
import { invalid } from "@/server/errors";
import { deleteMyAddress, saveMyAddress, toggleWishlist, updateMyProfile } from "@/modules/customers/service";
import { archiveMyPrescription, createPrescription } from "@/modules/prescriptions/service";
import { prescriptionValuesSchema } from "@/modules/prescriptions/schema";
import { createReturn } from "@/modules/returns/service";
import { getT } from "@/i18n/server";

type R = ActionResult<unknown> | null;
const id = z.string().min(1).max(64);

export async function saveAddressAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  const res = await runAction(async () => {
    const actor = await requireCustomer();
    const d = formToObject(form);
    await saveMyAddress(actor, d.id ? id.parse(d.id) : null, d, d.isDefault === "on");
  }, t("تم حفظ العنوان"));
  if (res.ok) revalidatePath("/account/addresses");
  return res;
}

export async function deleteAddressAction(_p: R, form: FormData): Promise<R> {
  const res = await runAction(async () => deleteMyAddress(await requireCustomer(), id.parse(form.get("id"))));
  if (res.ok) revalidatePath("/account/addresses");
  return res;
}

export async function newPrescriptionAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  let ok = false;
  const res = await runAction(async () => {
    const actor = await requireCustomer();
    await enforceRateLimit(`rx:create:${actor.customerId}`, 20, 3600);
    const d = formToNested(form) as Record<string, unknown> & { rx?: Record<string, unknown> };
    const file = form.get("file");
    const hasFile = file instanceof File && file.size > 0;
    const hasValues = d.rx && Object.entries(d.rx).some(([k, v]) => k !== "pdType" && v !== "");
    let values = null;
    if (hasValues) {
      const parsed = prescriptionValuesSchema.safeParse(d.rx);
      if (!parsed.success) throw new z.ZodError(parsed.error.issues.map((i) => ({ ...i, path: ["rx", ...i.path] })));
      values = parsed.data;
    }
    if (!values && !hasFile) throw invalid(t("أدخل قيم الوصفة أو ارفع صورة لها"));
    await createPrescription(actor, { meta: { label: d.label, doctorName: d.doctorName, examDate: d.examDate }, values, file: hasFile ? file : null });
    ok = true;
  });
  if (ok) redirect("/account/prescriptions?saved=1");
  return res;
}

export async function archivePrescriptionAction(_p: R, form: FormData): Promise<R> {
  const res = await runAction(async () => archiveMyPrescription(await requireCustomer(), id.parse(form.get("id"))));
  if (res.ok) revalidatePath("/account/prescriptions");
  return res;
}

export async function requestReturnAction(_p: R, form: FormData): Promise<R> {
  let ok = false;
  const res = await runAction(async () => {
    const actor = await requireCustomer();
    await enforceRateLimit(`return:${actor.customerId}`, 10, 3600);
    const d = formToNested(form) as { orderId?: string; reason?: string; resolution?: string; customerNote?: string; items?: { orderItemId: string; quantity: string }[] };
    await createReturn(actor, { orderId: String(d.orderId ?? ""), reason: String(d.reason ?? ""), resolution: (d.resolution as "REFUND") ?? "REFUND", customerNote: d.customerNote, items: (d.items ?? []).map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity as never })) });
    ok = true;
  });
  if (ok) redirect("/account/returns?created=1");
  return res;
}

export async function removeWishlistAction(_p: R, form: FormData): Promise<R> {
  const res = await runAction(async () => toggleWishlist(await requireCustomer(), id.parse(form.get("productId"))));
  if (res.ok) revalidatePath("/account/wishlist");
  return res;
}

export async function profileAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  const res = await runAction(async () => updateMyProfile(await requireCustomer(), formToObject(form)), t("تم حفظ البيانات"));
  if (res.ok) revalidatePath("/account", "layout");
  return res;
}

export async function changePasswordAction(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  return runAction(async () => {
    await requireCustomer();
    const d = z
      .object({ current: z.string().min(1, t("أدخل كلمة المرور الحالية")), password: z.string().min(10, t("10 أحرف على الأقل")).max(128), confirm: z.string() })
      .refine((v) => v.password === v.confirm, { path: ["confirm"], message: t("كلمتا المرور غير متطابقتين") })
      .parse(formToObject(form));
    try {
      await auth.api.changePassword({ body: { currentPassword: d.current, newPassword: d.password, revokeOtherSessions: true }, headers: await headers() });
    } catch (err) {
      if (err instanceof APIError) throw invalid(t("كلمة المرور الحالية غير صحيحة"));
      throw err;
    }
  }, t("تم تغيير كلمة المرور وتسجيل الخروج من الأجهزة الأخرى"));
}
