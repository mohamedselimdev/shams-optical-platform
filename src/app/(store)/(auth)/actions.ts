"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db";
import { runAction, type ActionResult } from "@/server/action";
import { signInWithPassword, signOut } from "@/server/auth/login";
import { loadCustomerActor } from "@/server/auth/session";
import { clientIp, enforceRateLimit } from "@/server/rate-limit";
import { readCartToken } from "@/server/storefront";
import { DomainError, invalid } from "@/server/errors";
import { safeRedirectPath, zEgyptPhone } from "@/lib/validation";
import { mergeGuestCart } from "@/modules/cart/service";
import { getT } from "@/i18n/server";

type R = ActionResult<unknown> | null;

const password = z.string().min(10, "كلمة المرور 10 أحرف على الأقل").max(128);

async function afterSignIn(userId: string) {
  const actor = await loadCustomerActor(userId);
  if (actor) await mergeGuestCart(await readCartToken(), actor.customerId);
}

export async function customerSignIn(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  const res = await runAction(async () => {
    const data = z.object({ email: z.string().trim().email(t("بريد إلكتروني غير صالح")), password: z.string().min(1, t("كلمة المرور مطلوبة")) }).parse(Object.fromEntries(form));
    const user = await signInWithPassword(data.email, data.password, "customer");
    if (user) await afterSignIn(user.id);
  });
  if (res.ok) redirect(safeRedirectPath(String(form.get("next") ?? ""), "/account"));
  return res;
}

export async function customerRegister(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  const res = await runAction(async () => {
    await enforceRateLimit(`register:${await clientIp()}`, 5, 600);
    const data = z
      .object({
        name: z.string().trim().min(2, t("الاسم مطلوب")).max(120),
        email: z.string().trim().toLowerCase().email(t("بريد إلكتروني غير صالح")).max(200),
        phone: zEgyptPhone,
        password,
        confirm: z.string(),
        terms: z.literal("on", { message: t("يجب الموافقة على الشروط وسياسة الخصوصية") }),
      })
      .refine((v) => v.password === v.confirm, { path: ["confirm"], message: t("كلمتا المرور غير متطابقتين") })
      .parse(Object.fromEntries(form));
    try {
      const out = await auth.api.signUpEmail({ body: { name: data.name, email: data.email, password: data.password, phone: data.phone, callbackURL: "/account?verified=1" }, headers: await headers() });
      await afterSignIn(out.user.id);
    } catch (err) {
      // Provider error details are never echoed; only a duplicate email gets a specific hint.
      if (err instanceof APIError) throw invalid(err.body?.code === "USER_ALREADY_EXISTS" || err.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ? t("هذا البريد مسجل بالفعل، سجّل الدخول أو استعد كلمة المرور") : t("تعذر إنشاء الحساب، تحقق من البيانات"));
      throw err;
    }
  });
  if (res.ok) redirect(safeRedirectPath(String(form.get("next") ?? ""), "/account?welcome=1"));
  return res;
}

export async function requestReset(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  return runAction(async () => {
    await enforceRateLimit(`reset:${await clientIp()}`, 5, 900);
    const email = z.string().trim().toLowerCase().email(t("بريد إلكتروني غير صالح")).parse(form.get("email"));
    const exists = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) {
      try {
        await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" }, headers: await headers() });
      } catch (err) {
        if (!(err instanceof APIError)) throw err;
      }
    }
    // Identical response either way: no account enumeration.
  }, t("إذا كان البريد مسجلاً لدينا فستصلك رسالة بها رابط إعادة التعيين خلال دقائق."));
}

export async function resetPassword(_p: R, form: FormData): Promise<R> {
  const t = await getT();
  const res = await runAction(async () => {
    const data = z
      .object({ token: z.string().min(10).max(500), password, confirm: z.string() })
      .refine((v) => v.password === v.confirm, { path: ["confirm"], message: t("كلمتا المرور غير متطابقتين") })
      .parse(Object.fromEntries(form));
    try {
      await auth.api.resetPassword({ body: { newPassword: data.password, token: data.token }, headers: await headers() });
    } catch (err) {
      if (err instanceof APIError) throw new DomainError("INVALID_STATE", t("الرابط غير صالح أو منتهي الصلاحية، اطلب رابطاً جديداً"));
      throw err;
    }
  });
  if (res.ok) redirect("/login?reset=1");
  return res;
}

export async function customerSignOut() {
  await signOut();
  redirect("/");
}
