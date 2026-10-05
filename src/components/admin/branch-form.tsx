import { ActionForm, type FormAction } from "@/ui/action-form";
import { CheckboxField, SelectField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { GOVERNORATES } from "@/lib/egypt";
import { getT } from "@/i18n/server";

type B = { id: string; code: string; slug: string; name: string; nameEn: string | null; type: string; governorate: string; city: string; cityEn: string | null; addressLine: string; addressLineEn: string | null; phone: string | null; email: string | null; latitude: number | null; longitude: number | null; openingHours: unknown; isActive: boolean; pickupEnabled: boolean; shipsOnline: boolean; sortOrder: number };

export async function BranchForm({ action, branch }: { action: FormAction; branch?: B }) {
  const t = await getT();
  const hours = (branch?.openingHours as { text?: string } | null)?.text ?? "";
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-3" resetOnSuccess={!branch}>
      {branch ? <input type="hidden" name="id" value={branch.id} /> : null}
      <TextField label={t("الاسم")} name="name" defaultValue={branch?.name} required />
      <TextField label={t("الكود")} name="code" defaultValue={branch?.code} dir="ltr" required />
      <TextField label={t("الرابط")} name="slug" defaultValue={branch?.slug} dir="ltr" required />
      <SelectField label={t("النوع")} name="type" defaultValue={branch?.type ?? "STORE"} options={[{ value: "STORE", label: t("فرع بيع") }, { value: "WAREHOUSE", label: t("مخزن") }]} />
      <SelectField label={t("المحافظة")} name="governorate" defaultValue={branch?.governorate} options={GOVERNORATES.map((g) => ({ value: g, label: t(g) }))} required />
      <TextField label={t("المدينة / الحي")} name="city" defaultValue={branch?.city} required />
      <TextField label={t("العنوان")} name="addressLine" defaultValue={branch?.addressLine} className="sm:col-span-2" required />
      <TextField label={t("المدينة / الحي بالإنجليزية")} name="cityEn" defaultValue={branch?.cityEn ?? ""} dir="ltr" />
      <TextField label={t("العنوان بالإنجليزية")} name="addressLineEn" defaultValue={branch?.addressLineEn ?? ""} className="sm:col-span-2" dir="ltr" />
      <TextField label={t("الهاتف")} name="phone" defaultValue={branch?.phone ?? ""} dir="ltr" />
      <TextField label={t("البريد")} name="email" defaultValue={branch?.email ?? ""} dir="ltr" />
      <TextField label={t("خط العرض")} name="latitude" defaultValue={branch?.latitude ?? ""} dir="ltr" />
      <TextField label={t("خط الطول")} name="longitude" defaultValue={branch?.longitude ?? ""} dir="ltr" />
      <TextField label={t("مواعيد العمل")} name="openingHours" defaultValue={hours} className="sm:col-span-2" placeholder={t("يومياً 10 ص – 11 م")} />
      <TextField label={t("الترتيب")} name="sortOrder" defaultValue={branch?.sortOrder ?? 0} dir="ltr" />
      <div className="flex flex-wrap gap-4 sm:col-span-3">
        <CheckboxField name="isActive" label={t("نشط")} defaultChecked={branch?.isActive ?? true} />
        <CheckboxField name="pickupEnabled" label={t("متاح للاستلام من الفرع")} defaultChecked={branch?.pickupEnabled ?? true} />
        <CheckboxField name="shipsOnline" label={t("يشحن طلبات المتجر الإلكتروني")} defaultChecked={branch?.shipsOnline ?? false} />
      </div>
      <div className="sm:col-span-3"><SubmitButton size="sm">{branch ? t("حفظ التعديلات") : t("إضافة الفرع")}</SubmitButton></div>
    </ActionForm>
  );
}
