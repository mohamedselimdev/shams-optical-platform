import Link from "next/link";
import { ActionForm } from "@/ui/action-form";
import { TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { requestReset } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("استعادة كلمة المرور"), robots: { index: false } };
}

export default async function Forgot() {
  const t = await getT();
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">{t("استعادة كلمة المرور")}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t("أدخل بريدك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.")}</p>
      <ActionForm action={requestReset} className="mt-6 space-y-4">
        <TextField label={t("البريد الإلكتروني")} name="email" type="email" dir="ltr" autoComplete="email" required />
        <SubmitButton className="w-full" size="lg" pendingLabel={t("جارٍ الإرسال…")}>{t("إرسال الرابط")}</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="underline">{t("العودة لتسجيل الدخول")}</Link></p>
    </>
  );
}
