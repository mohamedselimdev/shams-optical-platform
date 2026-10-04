"use client";

import { useState } from "react";
import { ActionForm, useFieldError, type FormAction } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { CheckboxField, SelectField, TextArea, TextField } from "@/ui/fields";
import { formatMoney } from "@/lib/money";
import { cn } from "@/ui/cn";
import { track } from "./analytics";

type Rate = { id: string; name: string; price: number; freeOverTotal: number | null; codAllowed: boolean; codFee: number; minDays: number; maxDays: number; governorates: string[] };
type Method = { value: "CARD" | "WALLET" | "COD" | "PAY_AT_BRANCH"; label: string; hint: string; sandbox?: boolean };

type Props = {
  action: FormAction;
  idempotencyKey: string;
  governorates: readonly string[];
  branches: { id: string; name: string; address: string; available: boolean }[];
  rates: Rate[];
  addresses: { id: string; label: string; governorate: string }[];
  methods: Method[];
  codMaxTotal: number;
  /** Merchandise total after discounts (display estimate only). */
  merchandiseTotal: number;
  requiresPrescription: boolean;
  contact: { name: string; email: string; phone: string };
  loyalty: { balance: number; pointValue: number; minRedeem: number } | null;
};

/**
 * Checkout inputs. The running total here is an estimate for the shopper; the server recomputes prices,
 * promotions, shipping, COD fee, loyalty and tax from the database when the order is placed.
 */
export function CheckoutForm(p: Props) {
  const [fulfillment, setFulfillment] = useState<"DELIVERY" | "PICKUP">(p.rates.length ? "DELIVERY" : "PICKUP");
  const [addressId, setAddressId] = useState(p.addresses[0]?.id ?? "");
  const [governorate, setGovernorate] = useState("");
  const [rateId, setRateId] = useState("");
  const [method, setMethod] = useState<Method["value"] | "">("");

  const gov = fulfillment === "DELIVERY" ? (addressId ? p.addresses.find((a) => a.id === addressId)?.governorate ?? "" : governorate) : "";
  const rates = p.rates.filter((r) => r.governorates.includes(gov));
  const rate = rates.find((r) => r.id === rateId) ?? null;
  const shipping = rate ? (rate.freeOverTotal !== null && p.merchandiseTotal >= rate.freeOverTotal ? 0 : rate.price) : 0;
  const codFee = method === "COD" && rate ? rate.codFee : 0;
  const methods = p.methods.filter((m) => (fulfillment === "DELIVERY" ? m.value !== "PAY_AT_BRANCH" : m.value !== "COD"));
  const codBlocked = method === "COD" && (rate ? !rate.codAllowed : false);

  return (
    <ActionForm action={p.action} className="space-y-8">
      <input type="hidden" name="idempotencyKey" value={p.idempotencyKey} />

      <section className="space-y-4">
        <h2 className="font-semibold">١. بيانات التواصل</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="الاسم بالكامل" name="contactName" defaultValue={p.contact.name} required autoComplete="name" />
          <TextField label="رقم الموبايل" name="contactPhone" defaultValue={p.contact.phone} required inputMode="tel" dir="ltr" autoComplete="tel" placeholder="01xxxxxxxxx" />
          <TextField label="البريد الإلكتروني" name="contactEmail" type="email" defaultValue={p.contact.email} dir="ltr" autoComplete="email" hint="لإرسال تأكيد الطلب وتحديثات الحالة" className="sm:col-span-2" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">٢. طريقة الاستلام</h2>
        <div className="grid grid-cols-2 gap-2">
          {(["DELIVERY", "PICKUP"] as const).map((f) => (
            <label key={f} className={cn("cursor-pointer rounded-lg border p-4 text-sm", fulfillment === f ? "border-ink ring-1 ring-ink" : "border-line-strong", f === "DELIVERY" && !p.rates.length && "pointer-events-none opacity-50")}>
              <input type="radio" name="fulfillmentType" value={f} checked={fulfillment === f} onChange={() => { setFulfillment(f); setMethod(""); }} className="sr-only" disabled={f === "DELIVERY" && !p.rates.length} />
              <span className="font-medium">{f === "DELIVERY" ? "توصيل للعنوان" : "استلام من الفرع"}</span>
              <span className="block text-ink-muted">{f === "DELIVERY" ? "لكل المحافظات حسب منطقة الشحن" : "مجاناً من أقرب فرع"}</span>
            </label>
          ))}
        </div>

        {fulfillment === "PICKUP" ? (
          <label className="block space-y-1.5">
            <span className="block text-sm font-medium text-ink-soft">فرع الاستلام<span className="ms-0.5 text-danger" aria-hidden>*</span></span>
            <select name="pickupBranchId" required defaultValue="" onChange={(e) => e.target.value && track({ name: "branch_selected", branchId: e.target.value })} className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm">
              <option value="" disabled>اختر الفرع</option>
              {p.branches.map((b) => (
                <option key={b.id} value={b.id} disabled={!b.available}>{b.name} — {b.address}{b.available ? "" : " (غير متوفر حالياً)"}</option>
              ))}
            </select>
            <PickupError />
          </label>
        ) : (
          <div className="space-y-4">
            {p.addresses.length ? (
              <SelectField
                label="العنوان"
                name="addressId"
                value={addressId}
                onChange={(e) => { setAddressId(e.target.value); setRateId(""); }}
                options={[...p.addresses.map((a) => ({ value: a.id, label: a.label })), { value: "", label: "+ عنوان جديد" }]}
              />
            ) : null}
            {!addressId ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="اسم المستلم" name="address.fullName" defaultValue={p.contact.name} hint="اتركه فارغاً لاستخدام اسم التواصل" />
                <TextField label="موبايل المستلم" name="address.phone" inputMode="tel" dir="ltr" defaultValue={p.contact.phone} hint="اتركه فارغاً لاستخدام رقم التواصل" />
                <SelectField label="المحافظة" name="address.governorate" required placeholder="اختر المحافظة" value={governorate} onChange={(e) => { setGovernorate(e.target.value); setRateId(""); }} options={p.governorates.map((g) => ({ value: g, label: g }))} />
                <TextField label="المدينة / الحي" name="address.city" required />
                <TextField label="المنطقة" name="address.area" />
                <TextField label="الشارع" name="address.street" required />
                <TextField label="رقم العقار" name="address.building" />
                <div className="grid grid-cols-2 gap-4">
                  <TextField label="الدور" name="address.floor" />
                  <TextField label="الشقة" name="address.apartment" />
                </div>
                <TextField label="علامة مميزة" name="address.landmark" className="sm:col-span-2" />
              </div>
            ) : null}
            {gov ? (
              rates.length ? (
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-medium">طريقة الشحن</legend>
                  {rates.map((r) => (
                    <label key={r.id} className={cn("flex cursor-pointer items-center justify-between rounded-md border p-3 text-sm", rateId === r.id ? "border-ink bg-surface-2" : "border-line")}>
                      <span className="flex items-center gap-2">
                        <input type="radio" name="shippingRateId" value={r.id} checked={rateId === r.id} onChange={() => setRateId(r.id)} className="accent-ink" />
                        {r.name} <span className="text-ink-muted">({r.minDays}–{r.maxDays} أيام)</span>
                      </span>
                      <span className="num">{r.freeOverTotal !== null && p.merchandiseTotal >= r.freeOverTotal ? "مجاناً" : formatMoney(r.price)}</span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <p className="rounded-md bg-warning-soft p-3 text-sm text-warning">التوصيل غير متاح حالياً لهذه المحافظة. يمكنك اختيار الاستلام من الفرع.</p>
              )
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">٣. طريقة الدفع</h2>
        {methods.length ? (
          <div className="space-y-2">
            {methods.map((m) => (
              <label key={m.value} className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm", method === m.value ? "border-ink bg-surface-2" : "border-line")}>
                <input type="radio" name="paymentMethod" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} className="mt-1 accent-ink" />
                <span>
                  <span className="font-medium">{m.label}</span>
                  {m.sandbox ? <span className="ms-2 rounded bg-warning-soft px-1.5 py-0.5 text-xs text-warning">وضع تجريبي</span> : null}
                  <span className="block text-ink-muted">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-danger">لا توجد طرق دفع متاحة لهذا الاختيار حالياً.</p>
        )}
        {codBlocked ? <p className="text-sm text-danger">الدفع عند الاستلام غير متاح لطريقة الشحن المختارة.</p> : null}
        {method === "COD" && p.merchandiseTotal + shipping > p.codMaxTotal ? <p className="text-sm text-danger">قيمة الطلب تتجاوز الحد الأقصى للدفع عند الاستلام ({formatMoney(p.codMaxTotal)}).</p> : null}
      </section>

      {p.loyalty && p.loyalty.balance >= p.loyalty.minRedeem ? (
        <section className="space-y-2">
          <h2 className="font-semibold">نقاط الولاء</h2>
          <TextField label={`استخدم نقاط (رصيدك ${p.loyalty.balance} نقطة، النقطة = ${formatMoney(p.loyalty.pointValue)})`} name="loyaltyPoints" inputMode="numeric" dir="ltr" placeholder="0" hint={`الحد الأدنى ${p.loyalty.minRedeem} نقطة`} />
        </section>
      ) : null}

      <TextArea label="ملاحظات للطلب (اختياري)" name="customerNote" rows={2} maxLength={500} />

      {p.requiresPrescription ? (
        <CheckboxField name="prescriptionConfirmed" label="أؤكد أن بيانات الوصفة الطبية صحيحة وحديثة، وأوافق على مراجعتها من أخصائي شمس قبل التصنيع." />
      ) : null}

      <div className="rounded-lg border border-line bg-surface p-4 text-sm">
        <div className="flex justify-between"><span>المنتجات بعد الخصم</span><span className="num">{formatMoney(p.merchandiseTotal)}</span></div>
        {fulfillment === "DELIVERY" ? <div className="flex justify-between"><span>الشحن</span><span className="num">{rate ? (shipping ? formatMoney(shipping) : "مجاناً") : "—"}</span></div> : null}
        {codFee ? <div className="flex justify-between"><span>رسوم الدفع عند الاستلام</span><span className="num">{formatMoney(codFee)}</span></div> : null}
        <div className="mt-2 flex justify-between border-t border-line pt-2 text-base font-semibold"><span>الإجمالي التقديري</span><span className="num">{formatMoney(p.merchandiseTotal + shipping + codFee)}</span></div>
        <p className="mt-1 text-xs text-ink-muted">يتم تأكيد الإجمالي النهائي (بما في ذلك نقاط الولاء) عند إنشاء الطلب.</p>
      </div>

      <SubmitButton size="lg" className="w-full" pendingLabel="جارٍ إنشاء الطلب…" disabled={!method || codBlocked} onClick={() => track({ name: "payment_started", props: { method } })}>
        {method === "CARD" || method === "WALLET" ? "المتابعة إلى الدفع" : "تأكيد الطلب"}
      </SubmitButton>
    </ActionForm>
  );
}

function PickupError() {
  const err = useFieldError("pickupBranchId");
  return err ? <span className="block text-xs text-danger">{err}</span> : null;
}
