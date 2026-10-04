import { requireCustomerPage } from "@/server/auth/session";
import { listMyPrescriptions } from "@/modules/prescriptions/service";
import { formatDiopter, formatPd } from "@/lib/optics";
import { PRESCRIPTION_STATUS_LABELS } from "@/i18n/labels";
import { PrescriptionFields } from "@/components/rx/prescription-fields";
import { ActionForm } from "@/ui/action-form";
import { TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, DateText } from "@/ui/primitives";
import { archivePrescriptionAction, newPrescriptionAction } from "../actions";

export const metadata = { title: "وصفاتي الطبية" };

const tone = { PENDING_REVIEW: "warning", VERIFIED: "success", REJECTED: "danger", NEEDS_INFO: "info" } as const;

export default async function Prescriptions({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const actor = await requireCustomerPage("/account/prescriptions");
  const [list, sp] = await Promise.all([listMyPrescriptions(actor), searchParams]);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">وصفاتي الطبية</h1>
        <p className="mt-1 text-sm text-ink-muted">بياناتك الطبية خاصة: لا يطّلع عليها إلا أخصائيو البصريات المصرح لهم، ويُسجَّل كل اطلاع.</p>
      </div>
      {sp.saved ? <p role="status" className="rounded-md bg-success-soft p-3 text-sm text-success">تم حفظ الوصفة، وسيراجعها أخصائي عند استخدامها في طلب.</p> : null}
      {list.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((r) => (
            <li key={r.id} className="rounded-lg border border-line bg-surface p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{r.label}</p>
                <Badge tone={tone[r.status as keyof typeof tone] ?? "neutral"}>{PRESCRIPTION_STATUS_LABELS[r.status]}</Badge>
              </div>
              <p className="text-xs text-ink-muted"><DateText value={r.createdAt} />{r.doctorName ? ` · د. ${r.doctorName}` : ""}</p>
              {r.odSph !== null || r.osSph !== null ? (
                <table className="num mt-3 w-full text-xs" dir="ltr">
                  <thead><tr className="text-ink-muted"><th></th><th>SPH</th><th>CYL</th><th>AXIS</th><th>ADD</th></tr></thead>
                  <tbody>
                    <tr><th className="text-start">OD</th><td>{formatDiopter(r.odSph)}</td><td>{formatDiopter(r.odCyl)}</td><td>{r.odAxis ?? "—"}</td><td>{formatDiopter(r.odAdd)}</td></tr>
                    <tr><th className="text-start">OS</th><td>{formatDiopter(r.osSph)}</td><td>{formatDiopter(r.osCyl)}</td><td>{r.osAxis ?? "—"}</td><td>{formatDiopter(r.osAdd)}</td></tr>
                  </tbody>
                </table>
              ) : null}
              {r.pd || r.pdRight ? <p className="mt-2 text-xs">PD: <span className="num" dir="ltr">{r.pdType === "DUAL" ? `${formatPd(r.pdRight)} / ${formatPd(r.pdLeft)}` : formatPd(r.pd)}</span></p> : null}
              {r.file ? <a href={`/api/prescriptions/file/${r.file.id}`} target="_blank" rel="noopener" className="mt-2 inline-block text-xs underline">عرض الملف المرفوع</a> : null}
              {r.reviewNote && r.status !== "VERIFIED" ? <p className="mt-2 rounded bg-info-soft p-2 text-xs text-info">{r.reviewNote}</p> : null}
              <ActionForm action={archivePrescriptionAction} showSuccess={false} className="mt-3">
                <input type="hidden" name="id" value={r.id} />
                <SubmitButton variant="ghost" size="sm" className="text-danger" pendingLabel="…">حذف من حسابي</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : null}
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 font-semibold">إضافة وصفة</h2>
        <p className="mb-4 text-sm text-ink-muted">أدخل القيم كما في وصفة الطبيب، أو ارفع صورة واضحة لها، أو الاثنين معاً.</p>
        <ActionForm action={newPrescriptionAction} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="اسم الوصفة" name="label" required placeholder="مثلاً: نظارة القراءة" />
            <TextField label="اسم الطبيب" name="doctorName" />
            <TextField label="تاريخ الكشف" name="examDate" type="date" />
          </div>
          <PrescriptionFields prefix="rx." />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">صورة الوصفة (اختياري)</span>
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-2" />
          </label>
          <SubmitButton>حفظ الوصفة</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
