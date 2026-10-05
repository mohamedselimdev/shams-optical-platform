import { db } from "@/server/db";
import { requireCustomerPage } from "@/server/auth/session";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { changePasswordAction, profileAction } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("الملف الشخصي") };
}

export default async function Profile() {
  const t = await getT();
  const actor = await requireCustomerPage("/account/profile");
  const c = await db.customer.findUniqueOrThrow({ where: { id: actor.customerId } });
  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-semibold">{t("الملف الشخصي")}</h1>
      <section className="rounded-lg border border-line bg-surface p-5">
        <ActionForm action={profileAction} className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("الاسم الأول")} name="firstName" required defaultValue={c.firstName} />
          <TextField label={t("اسم العائلة")} name="lastName" defaultValue={c.lastName ?? ""} />
          <TextField label={t("رقم الموبايل")} name="phone" inputMode="tel" dir="ltr" defaultValue={c.phone ?? ""} />
          <TextField label={t("البريد الإلكتروني")} name="emailDisplay" dir="ltr" defaultValue={actor.email} disabled hint={t("لتغيير البريد تواصل مع خدمة العملاء")} />
          <CheckboxField name="marketingOptIn" defaultChecked={c.marketingOptIn} label={t("أرغب في تلقي العروض والأخبار")} className="sm:col-span-2" />
          <div className="sm:col-span-2"><SubmitButton>{t("حفظ")}</SubmitButton></div>
        </ActionForm>
      </section>
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 font-semibold">{t("تغيير كلمة المرور")}</h2>
        <ActionForm action={changePasswordAction} resetOnSuccess className="grid gap-4 sm:grid-cols-3">
          <TextField label={t("الحالية")} name="current" type="password" dir="ltr" autoComplete="current-password" required />
          <TextField label={t("الجديدة")} name="password" type="password" dir="ltr" autoComplete="new-password" required />
          <TextField label={t("تأكيد الجديدة")} name="confirm" type="password" dir="ltr" autoComplete="new-password" required />
          <div className="sm:col-span-3"><SubmitButton>{t("تغيير كلمة المرور")}</SubmitButton></div>
        </ActionForm>
      </section>
    </div>
  );
}
