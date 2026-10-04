"use client";

import { useState } from "react";
import { ActionForm, type FormAction, useFieldError } from "@/ui/action-form";
import { CheckboxField, SelectField, TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Card, CardBody, CardHeader } from "@/ui/primitives";

type Opt = { value: string; label: string };
export type PromotionValues = {
  id?: string; name: string; description: string; kind: string; code: string; discountType: string; value: string; maxDiscount: string; minSubtotal: string;
  scope: string; targetIds: string[]; eligibility: string; excludeSaleItems: boolean; includeLenses: boolean; stackable: boolean; priority: string;
  usageLimit: string; usagePerCustomer: string; startsAt: string; endsAt: string; isActive: boolean;
};

export function PromotionForm({ action, initial, targets }: { action: FormAction; initial: PromotionValues; targets: Record<"PRODUCTS" | "CATEGORIES" | "BRANDS" | "COLLECTIONS", Opt[]> }) {
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
          <CardHeader title="العرض" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <TextField label="الاسم الداخلي" name="name" defaultValue={initial.name} required />
            <SelectField label="الآلية" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: "COUPON", label: "كوبون بكود" }, { value: "AUTOMATIC", label: "خصم تلقائي" }]} />
            {kind === "COUPON" ? <TextField label="الكود" name="code" defaultValue={initial.code} dir="ltr" required /> : null}
            <TextArea label="الوصف (يظهر للعميل)" name="description" defaultValue={initial.description} rows={2} className="sm:col-span-2" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="قيمة الخصم" />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <SelectField label="النوع" name="discountType" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: "PERCENTAGE", label: "نسبة مئوية" }, { value: "FIXED_AMOUNT", label: "مبلغ ثابت" }, { value: "FREE_SHIPPING", label: "شحن مجاني" }]} />
            {type !== "FREE_SHIPPING" ? <TextField label={type === "PERCENTAGE" ? "النسبة %" : "المبلغ (ج.م)"} name="value" defaultValue={initial.value} inputMode="decimal" dir="ltr" required /> : <input type="hidden" name="value" value="0" />}
            {type === "PERCENTAGE" ? <TextField label="أقصى خصم (ج.م)" name="maxDiscount" defaultValue={initial.maxDiscount} inputMode="decimal" dir="ltr" /> : null}
            <TextField label="حد أدنى للطلب (ج.م)" name="minSubtotal" defaultValue={initial.minSubtotal} inputMode="decimal" dir="ltr" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="النطاق" />
          <CardBody className="space-y-4">
            <SelectField label="يُطبَّق على" name="scope" value={scope} onChange={(e) => setScope(e.target.value)} options={[{ value: "ORDER", label: "الطلب بالكامل" }, { value: "PRODUCTS", label: "منتجات محددة" }, { value: "CATEGORIES", label: "تصنيفات" }, { value: "BRANDS", label: "ماركات" }, { value: "COLLECTIONS", label: "مجموعات" }]} />
            {list.length ? (
              <div className="grid max-h-64 gap-2 overflow-y-auto rounded-md border border-line p-3 sm:grid-cols-2">
                {list.map((o) => <CheckboxField key={o.value} name="targetIds[]" value={o.value} label={o.label} defaultChecked={initial.targetIds.includes(o.value)} />)}
              </div>
            ) : null}
            {targetErr ? <p className="text-xs text-danger">{targetErr}</p> : null}
            <div className="flex flex-wrap gap-4">
              <CheckboxField name="excludeSaleItems" label="استثناء المنتجات المخفضة" defaultChecked={initial.excludeSaleItems} />
              <CheckboxField name="includeLenses" label="يشمل سعر العدسات" defaultChecked={initial.includeLenses} />
              <CheckboxField name="stackable" label="قابل للجمع مع عروض أخرى" defaultChecked={initial.stackable} />
            </div>
          </CardBody>
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader title="الحالة والمدة" />
          <CardBody className="space-y-4">
            <CheckboxField name="isActive" label="مفعّل" defaultChecked={initial.isActive} />
            <TextField label="يبدأ" name="startsAt" type="datetime-local" defaultValue={initial.startsAt} />
            <TextField label="ينتهي" name="endsAt" type="datetime-local" defaultValue={initial.endsAt} />
            <SubmitButton className="w-full">حفظ العرض</SubmitButton>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="الحدود" />
          <CardBody className="space-y-4">
            <SelectField label="العملاء المؤهلون" name="eligibility" defaultValue={initial.eligibility} options={[{ value: "ALL", label: "الجميع" }, { value: "NEW_CUSTOMERS", label: "أول طلب فقط" }, { value: "SPECIFIC", label: "عملاء محددون" }]} />
            <TextField label="إجمالي مرات الاستخدام" name="usageLimit" defaultValue={initial.usageLimit} inputMode="numeric" dir="ltr" hint="فارغ = بلا حد" />
            <TextField label="لكل عميل" name="usagePerCustomer" defaultValue={initial.usagePerCustomer} inputMode="numeric" dir="ltr" />
            <TextField label="الأولوية" name="priority" defaultValue={initial.priority} inputMode="numeric" dir="ltr" hint="الأعلى يُطبَّق أولاً" />
          </CardBody>
        </Card>
      </div>
    </ActionForm>
  );
}
