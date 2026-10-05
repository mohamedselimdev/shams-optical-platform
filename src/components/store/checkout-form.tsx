"use client";

import { useState } from "react";
import { ActionForm, useFieldError, type FormAction } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { CheckboxField, SelectField, TextArea, TextField } from "@/ui/fields";

import { cn } from "@/ui/cn";
import { track } from "./analytics";
import { useT } from "@/i18n/client";

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
  const t = useT();
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
        <h2 className="font-semibold">{t("١. بيانات التواصل")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("الاسم بالكامل")} name="contactName" defaultValue={p.contact.name} required autoComplete="name" />
          <TextField label={t("رقم الموبايل")} name="contactPhone" defaultValue={p.contact.phone} required inputMode="tel" dir="ltr" autoComplete="tel" placeholder="01xxxxxxxxx" />
          <TextField label={t("البريد الإلكتروني")} name="contactEmail" type="email" defaultValue={p.contact.email} dir="ltr" autoComplete="email" hint={t("لإرسال تأكيد الطلب وتحديثات الحالة")} className="sm:col-span-2" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">{t("٢. طريقة الاستلام")}</h2>
        <div className="grid grid-cols-2 gap-2">
          {(["DELIVERY", "PICKUP"] as const).map((f) => (
            <label key={f} className={cn("cursor-pointer rounded-lg border p-4 text-sm", fulfillment === f ? "border-ink ring-1 ring-ink" : "border-line-strong", f === "DELIVERY" && !p.rates.length && "pointer-events-none opacity-50")}>
              <input type="radio" name="fulfillmentType" value={f} checked={fulfillment === f} onChange={() => { setFulfillment(f); setMethod(""); }} className="sr-only" disabled={f === "DELIVERY" && !p.rates.length} />
              <span className="font-medium">{f === "DELIVERY" ? t("توصيل للعنوان") : t("استلام من الفرع")}</span>
              <span className="block text-ink-muted">{f === "DELIVERY" ? t("لكل المحافظات حسب منطقة الشحن") : t("مجاناً من أقرب فرع")}</span>
            </label>
          ))}
        </div>

        {fulfillment === "PICKUP" ? (
          <label className="block space-y-1.5">
            <span className="block text-sm font-medium text-ink-soft">{t("فرع الاستلام")}<span className="ms-0.5 text-danger" aria-hidden>*</span></span>
            <select name="pickupBranchId" required defaultValue="" onChange={(e) => e.target.value && track({ name: "branch_selected", branchId: e.target.value })} className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm">
              <option value="" disabled>{t("اختر الفرع")}</option>
              {p.branches.map((b) => (
                <option key={b.id} value={b.id} disabled={!b.available}>{b.name} — {b.address}{b.available ? "" : t(" (غير متوفر حالياً)")}</option>
              ))}
            </select>
            <PickupError />
          </label>
        ) : (
          <div className="space-y-4">
            {p.addresses.length ? (
              <SelectField
                label={t("العنوان")}
                name="addressId"
                value={addressId}
                onChange={(e) => { setAddressId(e.target.value); setRateId(""); }}
                options={[...p.addresses.map((a) => ({ value: a.id, label: a.label })), { value: "", label: t("+ عنوان جديد") }]}
              />
            ) : null}
            {!addressId ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={t("اسم المستلم")} name="address.fullName" defaultValue={p.contact.name} hint={t("اتركه فارغاً لاستخدام اسم التواصل")} />
                <TextField label={t("موبايل المستلم")} name="address.phone" inputMode="tel" dir="ltr" defaultValue={p.contact.phone} hint={t("اتركه فارغاً لاستخدام رقم التواصل")} />
                <SelectField label={t("المحافظة")} name="address.governorate" required placeholder={t("اختر المحافظة")} value={governorate} onChange={(e) => { setGovernorate(e.target.value); setRateId(""); }} options={p.governorates.map((g) => ({ value: g, label: t(g) }))} />
                <TextField label={t("المدينة / الحي")} name="address.city" required />
                <TextField label={t("المنطقة")} name="address.area" />
                <TextField label={t("الشارع")} name="address.street" required />
                <TextField label={t("رقم العقار")} name="address.building" />
                <div className="grid grid-cols-2 gap-4">
                  <TextField label={t("الدور")} name="address.floor" />
                  <TextField label={t("الشقة")} name="address.apartment" />
                </div>
                <TextField label={t("علامة مميزة")} name="address.landmark" className="sm:col-span-2" />
              </div>
            ) : null}
            {gov ? (
              rates.length ? (
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-medium">{t("طريقة الشحن")}</legend>
                  {rates.map((r) => (
                    <label key={r.id} className={cn("flex cursor-pointer items-center justify-between rounded-md border p-3 text-sm", rateId === r.id ? "border-ink bg-surface-2" : "border-line")}>
                      <span className="flex items-center gap-2">
                        <input type="radio" name="shippingRateId" value={r.id} checked={rateId === r.id} onChange={() => setRateId(r.id)} className="accent-ink" />
                        {r.name} <span className="text-ink-muted">{t("({0}–{1} أيام)", [r.minDays, r.maxDays])}</span>
                      </span>
                      <span className="num">{r.freeOverTotal !== null && p.merchandiseTotal >= r.freeOverTotal ? t("مجاناً") : t.money(r.price)}</span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <p className="rounded-md bg-warning-soft p-3 text-sm text-warning">{t("التوصيل غير متاح حالياً لهذه المحافظة. يمكنك اختيار الاستلام من الفرع.")}</p>
              )
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">{t("٣. طريقة الدفع")}</h2>
        {methods.length ? (
          <div className="space-y-2">
            {methods.map((m) => (
              <label key={m.value} className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm", method === m.value ? "border-ink bg-surface-2" : "border-line")}>
                <input type="radio" name="paymentMethod" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} className="mt-1 accent-ink" />
                <span>
                  <span className="font-medium">{m.label}</span>
                  {m.sandbox ? <span className="ms-2 rounded bg-warning-soft px-1.5 py-0.5 text-xs text-warning">{t("وضع تجريبي")}</span> : null}
                  <span className="block text-ink-muted">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-danger">{t("لا توجد طرق دفع متاحة لهذا الاختيار حالياً.")}</p>
        )}
        {codBlocked ? <p className="text-sm text-danger">{t("الدفع عند الاستلام غير متاح لطريقة الشحن المختارة.")}</p> : null}
        {method === "COD" && p.merchandiseTotal + shipping > p.codMaxTotal ? <p className="text-sm text-danger">{t("قيمة الطلب تتجاوز الحد الأقصى للدفع عند الاستلام ({0}).", [t.money(p.codMaxTotal)])}</p> : null}
      </section>

      {p.loyalty && p.loyalty.balance >= p.loyalty.minRedeem ? (
        <section className="space-y-2">
          <h2 className="font-semibold">{t("نقاط الولاء")}</h2>
          <TextField label={t("استخدم نقاط (رصيدك {0} نقطة، النقطة = {1})", [p.loyalty.balance, t.money(p.loyalty.pointValue)])} name="loyaltyPoints" inputMode="numeric" dir="ltr" placeholder="0" hint={t("الحد الأدنى {0} نقطة", [p.loyalty.minRedeem])} />
        </section>
      ) : null}

      <TextArea label={t("ملاحظات للطلب (اختياري)")} name="customerNote" rows={2} maxLength={500} />

      {p.requiresPrescription ? (
        <CheckboxField name="prescriptionConfirmed" label={t("أؤكد أن بيانات الوصفة الطبية صحيحة وحديثة، وأوافق على مراجعتها من أخصائي شمس قبل التصنيع.")} />
      ) : null}

      <div className="rounded-lg border border-line bg-surface p-4 text-sm">
        <div className="flex justify-between"><span>{t("المنتجات بعد الخصم")}</span><span className="num">{t.money(p.merchandiseTotal)}</span></div>
        {fulfillment === "DELIVERY" ? <div className="flex justify-between"><span>{t("الشحن")}</span><span className="num">{rate ? (shipping ? t.money(shipping) : t("مجاناً")) : "—"}</span></div> : null}
        {codFee ? <div className="flex justify-between"><span>{t("رسوم الدفع عند الاستلام")}</span><span className="num">{t.money(codFee)}</span></div> : null}
        <div className="mt-2 flex justify-between border-t border-line pt-2 text-base font-semibold"><span>{t("الإجمالي التقديري")}</span><span className="num">{t.money(p.merchandiseTotal + shipping + codFee)}</span></div>
        <p className="mt-1 text-xs text-ink-muted">{t("يتم تأكيد الإجمالي النهائي (بما في ذلك نقاط الولاء) عند إنشاء الطلب.")}</p>
      </div>

      <SubmitButton size="lg" className="w-full" pendingLabel={t("جارٍ إنشاء الطلب…")} disabled={!method || codBlocked} onClick={() => track({ name: "payment_started", props: { method } })}>
        {method === "CARD" || method === "WALLET" ? t("المتابعة إلى الدفع") : t("تأكيد الطلب")}
      </SubmitButton>
    </ActionForm>
  );
}

function PickupError() {
  const err = useFieldError("pickupBranchId");
  return err ? <span className="block text-xs text-danger">{err}</span> : null;
}
