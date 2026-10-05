import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { safeRedirectPath } from "@/lib/validation";
import { ActionForm } from "@/ui/action-form";
import { TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { customerSignIn } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("تسجيل الدخول"), robots: { index: false } };
}

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const t = await getT();
  const sp = await searchParams;
  const next = safeRedirectPath(sp.next, "/account");
  if (await getSession()) redirect(next);
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">{t("تسجيل الدخول")}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t("تابع طلباتك ووصفاتك ونقاط الولاء.")}</p>
      {sp.reset ? <p role="status" className="mt-4 rounded-md bg-success-soft p-3 text-sm text-success">{t("تم تغيير كلمة المرور، سجّل الدخول الآن.")}</p> : null}
      <ActionForm action={customerSignIn} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <TextField label={t("البريد الإلكتروني")} name="email" type="email" dir="ltr" autoComplete="email" required />
        <TextField label={t("كلمة المرور")} name="password" type="password" dir="ltr" autoComplete="current-password" required />
        <div className="text-sm"><Link href="/forgot-password" className="text-sun-700 hover:underline">{t("نسيت كلمة المرور؟")}</Link></div>
        <SubmitButton className="w-full" size="lg" pendingLabel={t("جارٍ الدخول…")}>{t("دخول")}</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-ink-muted">{t("ليس لديك حساب؟")}{" "}<Link href={`/register?next=${encodeURIComponent(next)}`} className="font-medium text-ink underline">{t("أنشئ حساباً")}</Link></p>
    </>
  );
}
