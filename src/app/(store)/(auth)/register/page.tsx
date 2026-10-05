import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { safeRedirectPath } from "@/lib/validation";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { customerRegister } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("إنشاء حساب"), robots: { index: false } };
}

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const t = await getT();
  const next = safeRedirectPath((await searchParams).next, "/account");
  if (await getSession()) redirect(next);
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">{t("إنشاء حساب")}</h1>
      <ActionForm action={customerRegister} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <TextField label={t("الاسم")} name="name" autoComplete="name" required />
        <TextField label={t("البريد الإلكتروني")} name="email" type="email" dir="ltr" autoComplete="email" required />
        <TextField label={t("رقم الموبايل")} name="phone" inputMode="tel" dir="ltr" autoComplete="tel" placeholder="01xxxxxxxxx" required />
        <TextField label={t("كلمة المرور")} name="password" type="password" dir="ltr" autoComplete="new-password" hint={t("10 أحرف على الأقل")} required />
        <TextField label={t("تأكيد كلمة المرور")} name="confirm" type="password" dir="ltr" autoComplete="new-password" required />
        <CheckboxField name="terms" label={<>{t("أوافق على")}{" "}<Link href="/pages/terms" className="underline">{t("الشروط والأحكام")}</Link> {t("و")}<Link href="/pages/privacy" className="underline">{t("سياسة الخصوصية")}</Link></>} />
        <SubmitButton className="w-full" size="lg" pendingLabel={t("جارٍ الإنشاء…")}>{t("إنشاء الحساب")}</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-ink-muted">{t("لديك حساب؟")}{" "}<Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-ink underline">{t("سجّل الدخول")}</Link></p>
    </>
  );
}
