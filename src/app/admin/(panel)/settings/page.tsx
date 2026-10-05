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
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("الإعدادات") };
}

async function Group({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  const t = await getT();
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader title={title} description={description} />
      <CardBody>
        <ActionForm action={saveSettingsAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="group" value={id} />
          {children}
          <div className="sm:col-span-2"><SubmitButton size="sm">{t("حفظ")}</SubmitButton></div>
        </ActionForm>
      </CardBody>
    </Card>
  );
}

export default async function SettingsPage() {
  const t = await getT();
  await requireStaffPage("settings.write");
  const [store, tax, checkout, loyalty, returns, analytics, branches] = await Promise.all([
    getSetting("store"), getSetting("tax"), getSetting("checkout"), getSetting("loyalty"), getSetting("returns"), getSetting("analytics"),
    db.branch.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title={t("الإعدادات")} description={t("قيم العمل المستخدمة في كل الحسابات. كل تعديل يُسجَّل في سجل التدقيق.")} />
      <div className="space-y-6">
        <Group id="store" title={t("بيانات المتجر")}>
          <TextField label={t("الاسم")} name="name" defaultValue={store.name} required />
          <TextField label={t("الاسم بالإنجليزية")} name="nameEn" defaultValue={store.nameEn} dir="ltr" />
          <TextField label={t("هاتف الدعم")} name="supportPhone" defaultValue={store.supportPhone} dir="ltr" />
          <TextField label={t("بريد الدعم")} name="supportEmail" defaultValue={store.supportEmail} dir="ltr" />
          <TextField label={t("واتساب")} name="whatsapp" defaultValue={store.whatsapp ?? ""} dir="ltr" />
          <TextField label={t("إنستجرام (رابط)")} name="instagram" defaultValue={store.instagram ?? ""} dir="ltr" />
          <TextField label={t("فيسبوك (رابط)")} name="facebook" defaultValue={store.facebook ?? ""} dir="ltr" />
        </Group>
        <Group id="tax" title={t("الضريبة")} description={t("ضريبة القيمة المضافة في مصر 14%. يمكن تخصيص نسبة لكل منتج.")}>
          <TextField label={t("النسبة الافتراضية %")} name="defaultRate" defaultValue={tax.defaultRateBps / 100} inputMode="decimal" dir="ltr" />
          <CheckboxField name="pricesIncludeTax" label={t("الأسعار المعروضة شاملة الضريبة")} defaultChecked={tax.pricesIncludeTax} />
        </Group>
        <Group id="checkout" title={t("الدفع والطلبات")}>
          <SelectField label={t("فرع تنفيذ طلبات التوصيل")} name="onlineFulfillmentBranchId" defaultValue={checkout.onlineFulfillmentBranchId ?? ""} options={branches.map((b) => ({ value: b.id, label: b.name }))} placeholder={t("تلقائي (أول فرع يشحن)")} />
          <TextField label={t("مهلة إتمام الدفع الإلكتروني (دقيقة)")} name="pendingPaymentTtlMinutes" defaultValue={checkout.pendingPaymentTtlMinutes} inputMode="numeric" dir="ltr" hint={t("بعدها يُلغى الطلب ويُحرَّر المخزون المحجوز")} />
          <TextField label={t("الحد الأقصى للدفع عند الاستلام (ج.م)")} name="codMaxTotal" defaultValue={toEgpString(checkout.codMaxTotal)} inputMode="decimal" dir="ltr" />
          <TextField label={t("أقصى كمية لكل منتج في السلة")} name="maxQuantityPerLine" defaultValue={checkout.maxQuantityPerLine} inputMode="numeric" dir="ltr" />
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            <CheckboxField name="cardEnabled" label={t("بطاقات")} defaultChecked={checkout.cardEnabled} />
            <CheckboxField name="walletEnabled" label={t("محافظ إلكترونية")} defaultChecked={checkout.walletEnabled} />
            <CheckboxField name="codEnabled" label={t("الدفع عند الاستلام")} defaultChecked={checkout.codEnabled} />
            <CheckboxField name="payAtBranchEnabled" label={t("الدفع في الفرع")} defaultChecked={checkout.payAtBranchEnabled} />
          </div>
        </Group>
        <Group id="loyalty" title={t("برنامج الولاء")}>
          <CheckboxField name="enabled" label={t("مفعّل")} defaultChecked={loyalty.enabled} className="sm:col-span-2" />
          <TextField label={t("نقاط لكل جنيه")} name="pointsPerEgp" defaultValue={loyalty.pointsPerEgp} inputMode="numeric" dir="ltr" />
          <TextField label={t("قيمة النقطة (ج.م)")} name="pointValue" defaultValue={toEgpString(loyalty.pointValuePiasters)} inputMode="decimal" dir="ltr" />
          <TextField label={t("أقل عدد نقاط للاستبدال")} name="minRedeemPoints" defaultValue={loyalty.minRedeemPoints} inputMode="numeric" dir="ltr" />
          <TextField label={t("أقصى نسبة من الطلب بالنقاط %")} name="maxRedeemPct" defaultValue={loyalty.maxRedeemBps / 100} inputMode="decimal" dir="ltr" />
        </Group>
        <Group id="returns" title={t("سياسة الإرجاع")}>
          <TextField label={t("مدة الإرجاع (يوم من التسليم)")} name="windowDays" defaultValue={returns.windowDays} inputMode="numeric" dir="ltr" />
          <div className="space-y-2">
            <CheckboxField name="allowCustomerRequests" label={t("السماح بطلبات الإرجاع من حساب العميل")} defaultChecked={returns.allowCustomerRequests} />
            <CheckboxField name="allowPrescriptionLensReturns" label={t("السماح بإرجاع العدسات الطبية المصنّعة")} defaultChecked={returns.allowPrescriptionLensReturns} />
          </div>
        </Group>
        <Group id="analytics" title={t("التحليلات")}>
          <CheckboxField name="enabled" label={t("تفعيل التحليلات الداخلية")} defaultChecked={analytics.enabled} />
          <CheckboxField name="requireConsent" label={t("طلب موافقة الزائر قبل التتبع")} defaultChecked={analytics.requireConsent} />
          <TextField label={t("اعتبار السلة متروكة بعد (دقيقة)")} name="abandonedCartMinutes" defaultValue={analytics.abandonedCartMinutes} inputMode="numeric" dir="ltr" />
        </Group>
      </div>
    </>
  );
}
