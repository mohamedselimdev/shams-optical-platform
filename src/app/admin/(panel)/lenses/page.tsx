import { requireStaffPage } from "@/server/auth/session";
import { lensAdminData } from "@/modules/lenses/admin";
import { toEgpString } from "@/lib/money";
import { formatDiopter } from "@/lib/optics";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, SelectField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, Money } from "@/ui/primitives";
import { LENS_GROUP_LABELS } from "@/i18n/labels";
import { saveMatrixAction, saveOptionAction, toggleLensAction } from "./actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("العدسات") };
}

type Data = Awaited<ReturnType<typeof lensAdminData>>;

async function OptionForm({ o, types }: { o?: Data["options"][number]; types: Data["types"] }) {
  const t = await getT();
  const ruleIds = types.filter((lensType) => lensType.optionRules.some((r) => r.optionId === o?.id)).map((lensType) => lensType.id);
  return (
    <ActionForm action={saveOptionAction} className="grid items-end gap-3 sm:grid-cols-6" resetOnSuccess={!o}>
      {o ? <input type="hidden" name="id" value={o.id} /> : null}
      <TextField label={t("الاسم")} name="name" defaultValue={o?.name} required className="sm:col-span-2" />
      <TextField label={t("المفتاح")} name="key" defaultValue={o?.key} dir="ltr" required />
      <SelectField label={t("المجموعة")} name="group" defaultValue={o?.group} options={Object.entries(LENS_GROUP_LABELS).map(([value, label]) => ({ value, label: t(label) }))} />
      <TextField label={t("السعر (ج.م)")} name="price" defaultValue={o ? toEgpString(o.price) : ""} inputMode="decimal" dir="ltr" required />
      <div className="space-y-1">
        <CheckboxField name="exclusive" label={t("حصري في مجموعته")} defaultChecked={o?.exclusive ?? true} />
        <CheckboxField name="isActive" label={t("نشط")} defaultChecked={o?.isActive ?? true} />
      </div>
      <TextField label={t("الوصف")} name="description" defaultValue={o?.description ?? ""} className="sm:col-span-3" />
      <fieldset className="sm:col-span-3">
        <legend className="text-xs text-ink-muted">{t("متاح مع (فارغ = كل الأنواع)")}</legend>
        <div className="mt-1 flex flex-wrap gap-3">{types.map((lensType) => <CheckboxField key={lensType.id} name="lensTypeIds[]" value={lensType.id} label={lensType.name} defaultChecked={ruleIds.includes(lensType.id)} />)}</div>
      </fieldset>
      <div className="sm:col-span-6"><SubmitButton size="sm" variant="secondary">{o ? t("حفظ") : t("إضافة خيار")}</SubmitButton></div>
    </ActionForm>
  );
}

async function Toggle({ kind, id, active }: { kind: "type" | "index"; id: string; active: boolean }) {
  const t = await getT();
  return (
    <ActionForm action={toggleLensAction} showSuccess={false}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <SubmitButton size="sm" variant="ghost">{active ? t("إيقاف") : t("تفعيل")}</SubmitButton>
    </ActionForm>
  );
}

export default async function LensesPage() {
  const t = await getT();
  const actor = await requireStaffPage("lenses.write");
  const data = await lensAdminData(actor);
  const priceOf = (typeId: string, i: string) => data.prices.find((p) => p.lensTypeId === typeId && p.lensIndexId === i && p.isActive)?.price;
  return (
    <>
      <PageHeader title={t("العدسات")} description={t("الأسعار هنا هي المرجع الوحيد عند الدفع؛ الطلبات السابقة تحتفظ بالسعر وقت الشراء.")} />
      <Card className="mb-6">
        <CardHeader title={t("أسعار الباقات (نوع × معامل انكسار)")} description={t("اترك الخانة فارغة إذا كان التركيب غير متاح.")} />
        <CardBody>
          <ActionForm action={saveMatrixAction}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-start text-xs text-ink-muted">{t("النوع")}</th>
                    {data.indexes.map((ix) => (
                      <th key={ix.id} className="p-2 text-start text-xs">
                        {ix.name} {!ix.isActive ? <Badge tone="neutral">{t("متوقف")}</Badge> : null}
                        <span className="num block font-normal text-ink-muted" dir="ltr">SPH {formatDiopter(ix.minSph)} … {formatDiopter(ix.maxSph)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.types.map((lensType) => (
                    <tr key={lensType.id} className="border-t border-line">
                      <th className="p-2 text-start font-medium">{lensType.name}{!lensType.isActive ? <Badge tone="neutral" className="ms-1">{t("متوقف")}</Badge> : null}{lensType.requiresPrescription ? null : <span className="block text-xs font-normal text-ink-muted">{t("بدون وصفة")}</span>}</th>
                      {data.indexes.map((ix) => {
                        const p = priceOf(lensType.id, ix.id);
                        return <td key={ix.id} className="p-2"><input name={`price.${lensType.id}.${ix.id}`} defaultValue={p !== undefined ? toEgpString(p) : ""} className="num h-9 w-28 rounded-md border border-line-strong px-2 text-sm" inputMode="decimal" dir="ltr" aria-label={`${lensType.name} ${ix.name}`} /></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4"><SubmitButton size="sm">{t("حفظ الأسعار")}</SubmitButton></div>
          </ActionForm>
        </CardBody>
      </Card>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("أنواع العدسات")} />
          <ul className="divide-y divide-line">
            {data.types.map((lensType) => <li key={lensType.id} className="flex items-center justify-between px-5 py-2 text-sm"><span>{lensType.name} {lensType.requiresAdd ? <Badge tone="info">{t("يتطلب ADD")}</Badge> : null}</span><Toggle kind="type" id={lensType.id} active={lensType.isActive} /></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title={t("معاملات الانكسار")} />
          <ul className="divide-y divide-line">
            {data.indexes.map((ix) => <li key={ix.id} className="flex items-center justify-between px-5 py-2 text-sm"><span>{ix.name} <span className="num text-xs text-ink-muted">CYL ≤ {formatDiopter(ix.maxCyl)}</span></span><Toggle kind="index" id={ix.id} active={ix.isActive} /></li>)}
          </ul>
        </Card>
      </div>
      <Card>
        <CardHeader title={t("الإضافات (طلاءات، فوتوكروميك، صبغة…)")} />
        <CardBody className="space-y-4">
          {data.options.map((o) => (
            <details key={o.id} className="rounded-md border border-line p-3">
              <summary className="cursor-pointer text-sm">{o.name} · {t(LENS_GROUP_LABELS[o.group])} · <Money value={o.price} /> {!o.isActive ? <Badge tone="neutral">{t("متوقف")}</Badge> : null}</summary>
              <div className="mt-3"><OptionForm o={o} types={data.types} /></div>
            </details>
          ))}
          <details className="rounded-md border border-dashed border-line p-3">
            <summary className="cursor-pointer text-sm text-sun-700">{t("إضافة خيار جديد")}</summary>
            <div className="mt-3"><OptionForm types={data.types} /></div>
          </details>
        </CardBody>
      </Card>
    </>
  );
}
