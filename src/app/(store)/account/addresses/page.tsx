import { db } from "@/server/db";
import { requireCustomerPage } from "@/server/auth/session";
import { GOVERNORATES } from "@/lib/egypt";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, SelectField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge } from "@/ui/primitives";
import { deleteAddressAction, saveAddressAction } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("العناوين") };
}

export default async function Addresses() {
  const t = await getT();
  const actor = await requireCustomerPage("/account/addresses");
  const addresses = await db.address.findMany({ where: { customerId: actor.customerId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-semibold">{t("العناوين")}</h1>
      {addresses.length ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="rounded-lg border border-line bg-surface p-4 text-sm">
              <p className="flex items-center gap-2 font-medium">{a.label ?? a.fullName}{a.isDefault ? <Badge tone="sun">{t("افتراضي")}</Badge> : null}</p>
              <p className="mt-1 text-ink-soft">{a.fullName} · <span className="num" dir="ltr">{a.phone}</span></p>
              <p className="text-ink-muted">{[a.street, a.building && t("عقار {0}", [a.building]), a.floor && t("دور {0}", [a.floor]), a.apartment && t("شقة {0}", [a.apartment]), a.area, a.city, t(a.governorate)].filter(Boolean).join(t("، "))}</p>
              <ActionForm action={deleteAddressAction} showSuccess={false} className="mt-3">
                <input type="hidden" name="id" value={a.id} />
                <SubmitButton variant="ghost" size="sm" className="text-danger" pendingLabel="…">{t("حذف")}</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-muted">{t("لا توجد عناوين محفوظة. تُحفظ عناوين التوصيل تلقائياً عند الطلب.")}</p>}
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 font-semibold">{t("إضافة عنوان")}</h2>
        <ActionForm action={saveAddressAction} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("اسم العنوان")} name="label" placeholder={t("المنزل، العمل…")} />
          <TextField label={t("اسم المستلم")} name="fullName" required defaultValue={actor.name} />
          <TextField label={t("موبايل المستلم")} name="phone" required inputMode="tel" dir="ltr" />
          <SelectField label={t("المحافظة")} name="governorate" required placeholder={t("اختر")} options={GOVERNORATES.map((g) => ({ value: g, label: t(g) }))} />
          <TextField label={t("المدينة / الحي")} name="city" required />
          <TextField label={t("المنطقة")} name="area" />
          <TextField label={t("الشارع")} name="street" required className="sm:col-span-2" />
          <TextField label={t("رقم العقار")} name="building" />
          <TextField label={t("الدور")} name="floor" />
          <TextField label={t("الشقة")} name="apartment" />
          <TextField label={t("علامة مميزة")} name="landmark" />
          <CheckboxField name="isDefault" label={t("اجعله العنوان الافتراضي")} className="sm:col-span-2" />
          <div className="sm:col-span-2"><SubmitButton>{t("حفظ العنوان")}</SubmitButton></div>
        </ActionForm>
      </section>
    </div>
  );
}
