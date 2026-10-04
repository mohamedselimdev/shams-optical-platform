import type { ReactNode } from "react";
import { requireStaffPage } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { db } from "@/server/db";
import { toEgpString } from "@/lib/money";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, SelectField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Card, CardBody, CardHeader } from "@/ui/primitives";
import { saveSettingsAction } from "./actions";

export const metadata = { title: "الإعدادات" };

function Group({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader title={title} description={description} />
      <CardBody>
        <ActionForm action={saveSettingsAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="group" value={id} />
          {children}
          <div className="sm:col-span-2"><SubmitButton size="sm">حفظ</SubmitButton></div>
        </ActionForm>
      </CardBody>
    </Card>
  );
}

export default async function SettingsPage() {
  await requireStaffPage("settings.write");
  const [store, tax, checkout, loyalty, returns, analytics, branches] = await Promise.all([
    getSetting("store"), getSetting("tax"), getSetting("checkout"), getSetting("loyalty"), getSetting("returns"), getSetting("analytics"),
    db.branch.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="الإعدادات" description="قيم العمل المستخدمة في كل الحسابات. كل تعديل يُسجَّل في سجل التدقيق." />
      <div className="space-y-6">
        <Group id="store" title="بيانات المتجر">
          <TextField label="الاسم" name="name" defaultValue={store.name} required />
          <TextField label="الاسم بالإنجليزية" name="nameEn" defaultValue={store.nameEn} dir="ltr" />
          <TextField label="هاتف الدعم" name="supportPhone" defaultValue={store.supportPhone} dir="ltr" />
          <TextField label="بريد الدعم" name="supportEmail" defaultValue={store.supportEmail} dir="ltr" />
          <TextField label="واتساب" name="whatsapp" defaultValue={store.whatsapp ?? ""} dir="ltr" />
          <TextField label="إنستجرام (رابط)" name="instagram" defaultValue={store.instagram ?? ""} dir="ltr" />
          <TextField label="فيسبوك (رابط)" name="facebook" defaultValue={store.facebook ?? ""} dir="ltr" />
        </Group>
        <Group id="tax" title="الضريبة" description="ضريبة القيمة المضافة في مصر 14%. يمكن تخصيص نسبة لكل منتج.">
          <TextField label="النسبة الافتراضية %" name="defaultRate" defaultValue={tax.defaultRateBps / 100} inputMode="decimal" dir="ltr" />
          <CheckboxField name="pricesIncludeTax" label="الأسعار المعروضة شاملة الضريبة" defaultChecked={tax.pricesIncludeTax} />
        </Group>
        <Group id="checkout" title="الدفع والطلبات">
          <SelectField label="فرع تنفيذ طلبات التوصيل" name="onlineFulfillmentBranchId" defaultValue={checkout.onlineFulfillmentBranchId ?? ""} options={branches.map((b) => ({ value: b.id, label: b.name }))} placeholder="تلقائي (أول فرع يشحن)" />
          <TextField label="مهلة إتمام الدفع الإلكتروني (دقيقة)" name="pendingPaymentTtlMinutes" defaultValue={checkout.pendingPaymentTtlMinutes} inputMode="numeric" dir="ltr" hint="بعدها يُلغى الطلب ويُحرَّر المخزون المحجوز" />
          <TextField label="الحد الأقصى للدفع عند الاستلام (ج.م)" name="codMaxTotal" defaultValue={toEgpString(checkout.codMaxTotal)} inputMode="decimal" dir="ltr" />
          <TextField label="أقصى كمية لكل منتج في السلة" name="maxQuantityPerLine" defaultValue={checkout.maxQuantityPerLine} inputMode="numeric" dir="ltr" />
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            <CheckboxField name="cardEnabled" label="بطاقات" defaultChecked={checkout.cardEnabled} />
            <CheckboxField name="walletEnabled" label="محافظ إلكترونية" defaultChecked={checkout.walletEnabled} />
            <CheckboxField name="codEnabled" label="الدفع عند الاستلام" defaultChecked={checkout.codEnabled} />
            <CheckboxField name="payAtBranchEnabled" label="الدفع في الفرع" defaultChecked={checkout.payAtBranchEnabled} />
          </div>
        </Group>
        <Group id="loyalty" title="برنامج الولاء">
          <CheckboxField name="enabled" label="مفعّل" defaultChecked={loyalty.enabled} className="sm:col-span-2" />
          <TextField label="نقاط لكل جنيه" name="pointsPerEgp" defaultValue={loyalty.pointsPerEgp} inputMode="numeric" dir="ltr" />
          <TextField label="قيمة النقطة (ج.م)" name="pointValue" defaultValue={toEgpString(loyalty.pointValuePiasters)} inputMode="decimal" dir="ltr" />
          <TextField label="أقل عدد نقاط للاستبدال" name="minRedeemPoints" defaultValue={loyalty.minRedeemPoints} inputMode="numeric" dir="ltr" />
          <TextField label="أقصى نسبة من الطلب بالنقاط %" name="maxRedeemPct" defaultValue={loyalty.maxRedeemBps / 100} inputMode="decimal" dir="ltr" />
        </Group>
        <Group id="returns" title="سياسة الإرجاع">
          <TextField label="مدة الإرجاع (يوم من التسليم)" name="windowDays" defaultValue={returns.windowDays} inputMode="numeric" dir="ltr" />
          <div className="space-y-2">
            <CheckboxField name="allowCustomerRequests" label="السماح بطلبات الإرجاع من حساب العميل" defaultChecked={returns.allowCustomerRequests} />
            <CheckboxField name="allowPrescriptionLensReturns" label="السماح بإرجاع العدسات الطبية المصنّعة" defaultChecked={returns.allowPrescriptionLensReturns} />
          </div>
        </Group>
        <Group id="analytics" title="التحليلات">
          <CheckboxField name="enabled" label="تفعيل التحليلات الداخلية" defaultChecked={analytics.enabled} />
          <CheckboxField name="requireConsent" label="طلب موافقة الزائر قبل التتبع" defaultChecked={analytics.requireConsent} />
          <TextField label="اعتبار السلة متروكة بعد (دقيقة)" name="abandonedCartMinutes" defaultValue={analytics.abandonedCartMinutes} inputMode="numeric" dir="ltr" />
        </Group>
      </div>
    </>
  );
}
