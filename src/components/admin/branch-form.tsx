import { ActionForm, type FormAction } from "@/ui/action-form";
import { CheckboxField, SelectField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { GOVERNORATES } from "@/lib/egypt";

type B = { id: string; code: string; slug: string; name: string; nameEn: string | null; type: string; governorate: string; city: string; addressLine: string; phone: string | null; email: string | null; latitude: number | null; longitude: number | null; openingHours: unknown; isActive: boolean; pickupEnabled: boolean; shipsOnline: boolean; sortOrder: number };

export function BranchForm({ action, branch }: { action: FormAction; branch?: B }) {
  const hours = (branch?.openingHours as { text?: string } | null)?.text ?? "";
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-3" resetOnSuccess={!branch}>
      {branch ? <input type="hidden" name="id" value={branch.id} /> : null}
      <TextField label="الاسم" name="name" defaultValue={branch?.name} required />
      <TextField label="الكود" name="code" defaultValue={branch?.code} dir="ltr" required />
      <TextField label="الرابط" name="slug" defaultValue={branch?.slug} dir="ltr" required />
      <SelectField label="النوع" name="type" defaultValue={branch?.type ?? "STORE"} options={[{ value: "STORE", label: "فرع بيع" }, { value: "WAREHOUSE", label: "مخزن" }]} />
      <SelectField label="المحافظة" name="governorate" defaultValue={branch?.governorate} options={GOVERNORATES.map((g) => ({ value: g, label: g }))} required />
      <TextField label="المدينة / الحي" name="city" defaultValue={branch?.city} required />
      <TextField label="العنوان" name="addressLine" defaultValue={branch?.addressLine} className="sm:col-span-2" required />
      <TextField label="الهاتف" name="phone" defaultValue={branch?.phone ?? ""} dir="ltr" />
      <TextField label="البريد" name="email" defaultValue={branch?.email ?? ""} dir="ltr" />
      <TextField label="خط العرض" name="latitude" defaultValue={branch?.latitude ?? ""} dir="ltr" />
      <TextField label="خط الطول" name="longitude" defaultValue={branch?.longitude ?? ""} dir="ltr" />
      <TextField label="مواعيد العمل" name="openingHours" defaultValue={hours} className="sm:col-span-2" placeholder="يومياً 10 ص – 11 م" />
      <TextField label="الترتيب" name="sortOrder" defaultValue={branch?.sortOrder ?? 0} dir="ltr" />
      <div className="flex flex-wrap gap-4 sm:col-span-3">
        <CheckboxField name="isActive" label="نشط" defaultChecked={branch?.isActive ?? true} />
        <CheckboxField name="pickupEnabled" label="متاح للاستلام من الفرع" defaultChecked={branch?.pickupEnabled ?? true} />
        <CheckboxField name="shipsOnline" label="يشحن طلبات المتجر الإلكتروني" defaultChecked={branch?.shipsOnline ?? false} />
      </div>
      <div className="sm:col-span-3"><SubmitButton size="sm">{branch ? "حفظ التعديلات" : "إضافة الفرع"}</SubmitButton></div>
    </ActionForm>
  );
}
