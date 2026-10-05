import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { staffGetPrescription } from "@/modules/prescriptions/service";
import { formatDiopter, formatPd } from "@/lib/optics";
import { loadOr404 } from "@/components/admin/load";
import { PageHeader } from "@/components/admin/page-header";
import { PrescriptionFields } from "@/components/rx/prescription-fields";
import { ActionForm } from "@/ui/action-form";
import { TextArea } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { buttonClass } from "@/ui/button";
import { Badge, Card, CardBody, CardHeader, DateText, DefinitionList } from "@/ui/primitives";
import { PRESCRIPTION_STATUS_LABELS } from "@/i18n/labels";
import { rxTone } from "@/i18n/tones";
import { reviewRxAction } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("وصفة طبية") };
}

const REASONS = ["مراجعة واعتماد", "تجهيز عدسات لطلب", "استفسار من العميل", "تدقيق جودة"];

export default async function RxDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reason?: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("prescriptions.read");
  const { id } = await params;
  const { reason } = await searchParams;
  if (!reason || !REASONS.includes(reason)) {
    // Purpose-of-access gate: values are only loaded (and the access audited) after a reason is given.
    return (
      <>
        <PageHeader back={{ href: "/admin/prescriptions", label: t("الوصفات") }} title={t("الاطلاع على وصفة طبية")} />
        <Card className="max-w-md">
          <CardBody>
            <form method="get" className="space-y-3">
              <label className="block text-sm font-medium" htmlFor="reason">{t("سبب الاطلاع")}</label>
              <select id="reason" name="reason" className="h-10 w-full rounded-md border border-line-strong px-2 text-sm" required>
                {REASONS.map((r) => <option key={r} value={r}>{t(r)}</option>)}
              </select>
              <p className="text-xs text-ink-muted">{t("يُسجَّل اسمك والسبب والوقت في سجل التدقيق.")}</p>
              <button className={buttonClass("primary", "md")}>{t("عرض الوصفة")}</button>
            </form>
          </CardBody>
        </Card>
      </>
    );
  }
  const rx = await loadOr404(() => staffGetPrescription(actor, id, reason));
  const canReview = can(actor, "prescriptions.review");
  const hasValues = rx.odSph !== null || rx.osSph !== null;
  const rows: [string, "Sph" | "Cyl" | "Axis" | "Add"][] = [["SPH", "Sph"], ["CYL", "Cyl"], ["AXIS", "Axis"], ["ADD", "Add"]];
  return (
    <>
      <PageHeader back={{ href: "/admin/prescriptions", label: t("الوصفات") }} title={rx.label} description={<Link className="text-sun-700 hover:underline" href={`/admin/customers/${rx.customer.id}`}>{rx.customer.firstName} {rx.customer.lastName ?? ""}</Link>} actions={<Badge tone={rxTone[rx.status]}>{t(PRESCRIPTION_STATUS_LABELS[rx.status])}</Badge>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("القيم")} />
          <CardBody>
            {hasValues ? (
              <table className="num w-full text-center text-sm" dir="ltr">
                <thead><tr className="text-xs text-ink-muted"><th></th>{rows.map(([l]) => <th key={l} className="py-1">{l}</th>)}</tr></thead>
                <tbody>
                  {(["od", "os"] as const).map((eye) => (
                    <tr key={eye} className="border-t border-line">
                      <th className="py-2 text-start">{eye.toUpperCase()}</th>
                      {rows.map(([, k]) => {
                        const v = rx[`${eye}${k}`];
                        return <td key={k}>{v === null ? "—" : k === "Axis" ? `${v}°` : formatDiopter(v)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-ink-muted">{t("لم تُدخل القيم بعد؛ يجب نسخها من الصورة قبل الاعتماد.")}</p>}
            <DefinitionList items={[
              { label: "PD", value: <span className="num" dir="ltr">{rx.pdType === "DUAL" ? `${formatPd(rx.pdRight)} / ${formatPd(rx.pdLeft)}` : formatPd(rx.pd)}</span> },
              { label: t("الطبيب"), value: rx.doctorName ?? "—" },
              { label: t("تاريخ الكشف"), value: rx.examDate ? <DateText value={rx.examDate} /> : "—" },
              { label: t("ملاحظات العميل"), value: rx.notes ?? "—" },
              ...(rx.reviewNote ? [{ label: t("ملاحظة المراجعة"), value: rx.reviewNote }] : []),
            ]} />
          </CardBody>
        </Card>
        {rx.file ? (
          <Card>
            <CardHeader title={t("صورة الوصفة")} actions={<a className="text-sm text-sun-700 hover:underline" href={`/api/prescriptions/file/${rx.file.id}`} target="_blank" rel="noopener">{t("فتح في نافذة ↗")}</a>} />
            <CardBody>
              {rx.file.mimeType === "application/pdf" ? <p className="text-sm">{t("ملف PDF — افتحه في نافذة جديدة.")}</p> : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/prescriptions/file/${rx.file.id}`} alt={t("صورة الوصفة الطبية")} className="max-h-[480px] w-full rounded-md bg-surface-2 object-contain" />
              )}
            </CardBody>
          </Card>
        ) : null}
        {canReview ? (
          <Card className="xl:col-span-2">
            <CardHeader title={t("المراجعة")} description={t("الاعتماد يسمح ببدء تجهيز العدسات للطلبات المرتبطة.")} />
            <CardBody>
              <ActionForm action={reviewRxAction} className="space-y-4">
                <input type="hidden" name="id" value={rx.id} />
                {rx.file ? (
                  <>
                    <input type="hidden" name="transcribe" value="1" />
                    <p className="text-sm font-medium">{t("انسخ القيم من الصورة")}</p>
                    <PrescriptionFields initial={{ ...rx, pdType: rx.pdType }} />
                  </>
                ) : null}
                <TextArea label={t("ملاحظة (تظهر للعميل عند الرفض)")} name="note" rows={2} />
                <div className="flex gap-2">
                  <SubmitButton name="decision" value="VERIFIED">{t("اعتماد الوصفة")}</SubmitButton>
                  <SubmitButton name="decision" value="REJECTED" variant="danger">{t("رفض")}</SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
