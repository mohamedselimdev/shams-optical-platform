"use client";

import { useState } from "react";
import { ActionForm, type FormAction, useFieldError } from "@/ui/action-form";
import { CheckboxField, SelectField, TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Card, CardBody, CardHeader } from "@/ui/primitives";
import { useT } from "@/i18n/client";

type Opt = { value: string; label: string };
export type PromotionValues = {
  id?: string; name: string; description: string; kind: string; code: string; discountType: string; value: string; maxDiscount: string; minSubtotal: string;
  scope: string; targetIds: string[]; eligibility: string; excludeSaleItems: boolean; includeLenses: boolean; stackable: boolean; priority: string;
  usageLimit: string; usagePerCustomer: string; startsAt: string; endsAt: string; isActive: boolean;
};

export function PromotionForm({ action, initial, targets }: { action: FormAction; initial: PromotionValues; targets: Record<"PRODUCTS" | "CATEGORIES" | "BRANDS" | "COLLECTIONS", Opt[]> }) {
  const t = useT();
  const [kind, setKind] = useState(initial.kind);
  const [type, setType] = useState(initial.discountType);
  const [scope, setScope] = useState(initial.scope);
  const targetErr = useFieldError("targetIds");
  const list = scope === "ORDER" ? [] : targets[scope as keyof typeof targets];
  return (
    <ActionForm action={action} className="grid gap-6 xl:grid-cols-3">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader title={t("العرض")} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <TextField label={t("الاسم الداخلي")} name="name" defaultValue={initial.name} required />
            <SelectField label={t("الآلية")} name="kind" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: "COUPON", label: t("كوبون بكود") }, { value: "AUTOMATIC", label: t("خصم تلقائي") }]} />
            {kind === "COUPON" ? <TextField label={t("الكود")} name="code" defaultValue={initial.code} dir="ltr" required /> : null}
            <TextArea label={t("الوصف (يظهر للعميل)")} name="description" defaultValue={initial.description} rows={2} className="sm:col-span-2" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("قيمة الخصم")} />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <SelectField label={t("النوع")} name="discountType" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: "PERCENTAGE", label: t("نسبة مئوية") }, { value: "FIXED_AMOUNT", label: t("مبلغ ثابت") }, { value: "FREE_SHIPPING", label: t("شحن مجاني") }]} />
            {type !== "FREE_SHIPPING" ? <TextField label={type === "PERCENTAGE" ? t("النسبة %") : t("المبلغ (ج.م)")} name="value" defaultValue={initial.value} inputMode="decimal" dir="ltr" required /> : <input type="hidden" name="value" value="0" />}
            {type === "PERCENTAGE" ? <TextField label={t("أقصى خصم (ج.م)")} name="maxDiscount" defaultValue={initial.maxDiscount} inputMode="decimal" dir="ltr" /> : null}
            <TextField label={t("حد أدنى للطلب (ج.م)")} name="minSubtotal" defaultValue={initial.minSubtotal} inputMode="decimal" dir="ltr" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("النطاق")} />
          <CardBody className="space-y-4">
            <SelectField label={t("يُطبَّق على")} name="scope" value={scope} onChange={(e) => setScope(e.target.value)} options={[{ value: "ORDER", label: t("الطلب بالكامل") }, { value: "PRODUCTS", label: t("منتجات محددة") }, { value: "CATEGORIES", label: t("تصنيفات") }, { value: "BRANDS", label: t("ماركات") }, { value: "COLLECTIONS", label: t("مجموعات") }]} />
            {list.length ? (
              <div className="grid max-h-64 gap-2 overflow-y-auto rounded-md border border-line p-3 sm:grid-cols-2">
                {list.map((o) => <CheckboxField key={o.value} name="targetIds[]" value={o.value} label={o.label} defaultChecked={initial.targetIds.includes(o.value)} />)}
              </div>
            ) : null}
            {targetErr ? <p className="text-xs text-danger">{targetErr}</p> : null}
            <div className="flex flex-wrap gap-4">
              <CheckboxField name="excludeSaleItems" label={t("استثناء المنتجات المخفضة")} defaultChecked={initial.excludeSaleItems} />
              <CheckboxField name="includeLenses" label={t("يشمل سعر العدسات")} defaultChecked={initial.includeLenses} />
              <CheckboxField name="stackable" label={t("قابل للجمع مع عروض أخرى")} defaultChecked={initial.stackable} />
            </div>
          </CardBody>
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader title={t("الحالة والمدة")} />
          <CardBody className="space-y-4">
            <CheckboxField name="isActive" label={t("مفعّل")} defaultChecked={initial.isActive} />
            <TextField label={t("يبدأ")} name="startsAt" type="datetime-local" defaultValue={initial.startsAt} />
            <TextField label={t("ينتهي")} name="endsAt" type="datetime-local" defaultValue={initial.endsAt} />
            <SubmitButton className="w-full">{t("حفظ العرض")}</SubmitButton>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("الحدود")} />
          <CardBody className="space-y-4">
            <SelectField label={t("العملاء المؤهلون")} name="eligibility" defaultValue={initial.eligibility} options={[{ value: "ALL", label: t("الجميع") }, { value: "NEW_CUSTOMERS", label: t("أول طلب فقط") }, { value: "SPECIFIC", label: t("عملاء محددون") }]} />
            <TextField label={t("إجمالي مرات الاستخدام")} name="usageLimit" defaultValue={initial.usageLimit} inputMode="numeric" dir="ltr" hint={t("فارغ = بلا حد")} />
            <TextField label={t("لكل عميل")} name="usagePerCustomer" defaultValue={initial.usagePerCustomer} inputMode="numeric" dir="ltr" />
            <TextField label={t("الأولوية")} name="priority" defaultValue={initial.priority} inputMode="numeric" dir="ltr" hint={t("الأعلى يُطبَّق أولاً")} />
          </CardBody>
        </Card>
      </div>
    </ActionForm>
  );
}
