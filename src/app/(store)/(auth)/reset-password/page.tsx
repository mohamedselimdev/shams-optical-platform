import Link from "next/link";
import { ActionForm } from "@/ui/action-form";
import { TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { resetPassword } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("تعيين كلمة مرور جديدة"), robots: { index: false } };
}

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const t = await getT();
  const sp = await searchParams;
  if (!sp.token || sp.error) {
    return (
      <>
        <h1 className="font-display text-2xl font-semibold">{t("الرابط غير صالح")}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t("ربما انتهت صلاحية الرابط (30 دقيقة). اطلب رابطاً جديداً.")}</p>
        <Link href="/forgot-password" className="mt-6 inline-block underline">{t("طلب رابط جديد")}</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">{t("تعيين كلمة مرور جديدة")}</h1>
      <ActionForm action={resetPassword} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={sp.token} />
        <TextField label={t("كلمة المرور الجديدة")} name="password" type="password" dir="ltr" autoComplete="new-password" hint={t("10 أحرف على الأقل")} required />
        <TextField label={t("تأكيد كلمة المرور")} name="confirm" type="password" dir="ltr" autoComplete="new-password" required />
        <SubmitButton className="w-full" size="lg">{t("حفظ")}</SubmitButton>
      </ActionForm>
    </>
  );
}
