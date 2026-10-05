import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { toEgpString } from "@/lib/money";
import { GOVERNORATES } from "@/lib/egypt";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, Money } from "@/ui/primitives";
import { saveRateAction, saveZoneAction } from "./actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("الشحن والاستلام") };
}

type Rate = { id: string; name: string; price: number; freeOverTotal: number | null; minDays: number; maxDays: number; codAllowed: boolean; codFee: number; isActive: boolean };

async function RateForm({ zoneId, rate }: { zoneId: string; rate?: Rate }) {
  const t = await getT();
  return (
    <ActionForm action={saveRateAction} className="grid items-end gap-2 sm:grid-cols-8" resetOnSuccess={!rate}>
      <input type="hidden" name="zoneId" value={zoneId} />
      {rate ? <input type="hidden" name="id" value={rate.id} /> : null}
      <TextField label={t("الاسم")} name="name" defaultValue={rate?.name} className="sm:col-span-2" required />
      <TextField label={t("السعر")} name="price" defaultValue={rate ? toEgpString(rate.price) : ""} inputMode="decimal" dir="ltr" required />
      <TextField label={t("مجاني فوق")} name="freeOverTotal" defaultValue={rate?.freeOverTotal != null ? toEgpString(rate.freeOverTotal) : ""} inputMode="decimal" dir="ltr" />
      <TextField label={t("من (يوم)")} name="minDays" defaultValue={rate?.minDays ?? 1} inputMode="numeric" dir="ltr" />
      <TextField label={t("إلى (يوم)")} name="maxDays" defaultValue={rate?.maxDays ?? 3} inputMode="numeric" dir="ltr" />
      <TextField label={t("رسوم COD")} name="codFee" defaultValue={rate ? toEgpString(rate.codFee) : ""} inputMode="decimal" dir="ltr" />
      <div className="space-y-1">
        <CheckboxField name="codAllowed" label="COD" defaultChecked={rate?.codAllowed ?? true} />
        <CheckboxField name="isActive" label={t("نشط")} defaultChecked={rate?.isActive ?? true} />
      </div>
      <div className="sm:col-span-8"><SubmitButton size="sm" variant="secondary">{rate ? t("حفظ") : t("إضافة سعر")}</SubmitButton></div>
    </ActionForm>
  );
}

async function ZoneForm({ zone }: { zone?: { id: string; name: string; governorates: string[]; isActive: boolean } }) {
  const t = await getT();
  return (
    <ActionForm action={saveZoneAction} className="space-y-3" resetOnSuccess={!zone}>
      {zone ? <input type="hidden" name="id" value={zone.id} /> : null}
      <TextField label={t("اسم المنطقة")} name="name" defaultValue={zone?.name} required />
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-soft">{t("المحافظات")}</legend>
        <div className="grid gap-1.5 sm:grid-cols-4">
          {GOVERNORATES.map((g) => <CheckboxField key={g} name="governorates[]" value={g} label={t(g)} defaultChecked={zone?.governorates.includes(g)} />)}
        </div>
      </fieldset>
      <CheckboxField name="isActive" label={t("نشطة")} defaultChecked={zone?.isActive ?? true} />
      <SubmitButton size="sm">{zone ? t("حفظ المنطقة") : t("إضافة منطقة")}</SubmitButton>
    </ActionForm>
  );
}

export default async function ShippingPage() {
  const t = await getT();
  await requireStaffPage("shipping.write");
  const zones = await db.shippingZone.findMany({ include: { rates: { orderBy: { price: "asc" } } }, orderBy: { sortOrder: "asc" } });
  const covered = new Set(zones.filter((z) => z.isActive).flatMap((z) => z.governorates));
  const uncovered = GOVERNORATES.filter((g) => !covered.has(g));
  return (
    <>
      <PageHeader title={t("الشحن والاستلام")} description={t("أسعار الشحن حسب المحافظة. الاستلام من الفرع مجاني ويُدار من إعدادات كل فرع.")} />
      {uncovered.length ? <p className="mb-4 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm">{t("محافظات بدون شحن: {0}", [uncovered.map((g) => t(g)).join(t("، "))])}</p> : null}
      <div className="space-y-6">
        {zones.map((z) => (
          <Card key={z.id}>
            <CardHeader title={<>{z.name} {!z.isActive ? <Badge tone="neutral">{t("متوقفة")}</Badge> : null}</>} description={z.governorates.map((g) => t(g)).join(t("، "))} />
            <CardBody className="space-y-4">
              {z.rates.map((r) => (
                <div key={r.id} className="rounded-md border border-line p-3">
                  <p className="mb-2 text-sm"><Money value={r.price} /> · {r.minDays}–{r.maxDays} {t("يوم")}{" "}{r.freeOverTotal != null ? <>{t("· مجاني فوق")}{" "}<Money value={r.freeOverTotal} /></> : null}</p>
                  <RateForm zoneId={z.id} rate={r} />
                </div>
              ))}
              <details className="rounded-md border border-dashed border-line p-3">
                <summary className="cursor-pointer text-sm text-sun-700">{t("إضافة سعر شحن")}</summary>
                <div className="mt-3"><RateForm zoneId={z.id} /></div>
              </details>
              <details className="rounded-md border border-dashed border-line p-3">
                <summary className="cursor-pointer text-sm text-sun-700">{t("تعديل المنطقة")}</summary>
                <div className="mt-3"><ZoneForm zone={z} /></div>
              </details>
            </CardBody>
          </Card>
        ))}
        <Card>
          <CardHeader title={t("منطقة جديدة")} />
          <CardBody><ZoneForm /></CardBody>
        </Card>
      </div>
    </>
  );
}
