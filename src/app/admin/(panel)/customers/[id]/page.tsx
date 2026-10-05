import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { customer360 } from "@/modules/customers/service";
import { loadOr404 } from "@/components/admin/load";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, DateText, DefinitionList, Money, Stat, Table, Td, Th } from "@/ui/primitives";
import { LOYALTY_TX_LABELS, ORDER_STATUS_LABELS, PRESCRIPTION_STATUS_LABELS, RETURN_STATUS_LABELS } from "@/i18n/labels";
import { orderTone, returnTone, rxTone } from "@/i18n/tones";
import { customerNoteAction, loyaltyAdjustAction } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("ملف العميل") };
}

export default async function Customer360({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("customers.read");
  const { id } = await params;
  const { customer: c, notes, prescriptions, loyaltyTx, stats } = await loadOr404(() => customer360(actor, id));
  return (
    <>
      <PageHeader back={{ href: "/admin/customers", label: t("العملاء") }} title={`${c.firstName} ${c.lastName ?? ""}`} description={c.userId ? t("حساب مسجل") : t("عميل بدون حساب")} />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label={t("الطلبات")} value={t.number(stats.orders)} />
        <Stat label={t("صافي المشتريات")} value={<Money value={stats.spent} />} />
        <Stat label={t("رصيد النقاط")} value={t.number(c.loyalty?.balance ?? 0)} />
        <Stat label={t("عميل منذ")} value={<DateText value={c.createdAt} />} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title={t("الطلبات")} />
            <Table>
              <thead><tr><Th>{t("الطلب")}</Th><Th>{t("الحالة")}</Th><Th>{t("الإجمالي")}</Th><Th>{t("التاريخ")}</Th></tr></thead>
              <tbody>
                {c.orders.map((o) => (
                  <tr key={o.id}>
                    <Td><Link className="num text-sun-700 hover:underline" href={`/admin/orders/${o.id}`}>{o.number}</Link></Td>
                    <Td><Badge tone={orderTone[o.status]}>{t(ORDER_STATUS_LABELS[o.status])}</Badge></Td>
                    <Td><Money value={o.total} /></Td>
                    <Td><DateText value={o.placedAt} /></Td>
                  </tr>
                ))}
                {c.orders.length === 0 ? <tr><Td colSpan={4} className="text-center text-ink-muted">{t("لا توجد طلبات")}</Td></tr> : null}
              </tbody>
            </Table>
          </Card>
          {prescriptions ? (
            <Card>
              <CardHeader title={t("الوصفات الطبية")} description={t("القيم تظهر فقط في صفحة الوصفة ويُسجَّل الاطلاع عليها.")} />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {prescriptions.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <Link href={`/admin/prescriptions/${p.id}`} className="text-sun-700 hover:underline">{p.label}</Link>
                      <Badge tone={rxTone[p.status]}>{t(PRESCRIPTION_STATUS_LABELS[p.status])}</Badge>
                      {p.isArchived ? <Badge tone="neutral">{t("مؤرشفة")}</Badge> : null}
                      <span className="text-ink-muted"><DateText value={p.createdAt} /></span>
                    </li>
                  ))}
                  {prescriptions.length === 0 ? <li className="text-ink-muted">{t("لا توجد وصفات")}</li> : null}
                </ul>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title={t("نقاط الولاء")} />
            <Table>
              <thead><tr><Th>{t("النوع")}</Th><Th>{t("النقاط")}</Th><Th>{t("الرصيد بعدها")}</Th><Th>{t("السبب")}</Th><Th>{t("التاريخ")}</Th></tr></thead>
              <tbody>
                {loyaltyTx.map((tx) => (
                  <tr key={tx.id}>
                    <Td>{t(LOYALTY_TX_LABELS[tx.type])}</Td>
                    <Td className="num" dir="ltr">{tx.points > 0 ? `+${tx.points}` : tx.points}</Td>
                    <Td className="num">{t.number(tx.balanceAfter)}</Td>
                    <Td className="text-xs">{tx.reason ? t.message(tx.reason) : "—"}</Td>
                    <Td><DateText value={tx.createdAt} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {can(actor, "loyalty.adjust") ? (
              <CardBody className="border-t border-line">
                <ActionForm action={loyaltyAdjustAction} className="grid gap-3 sm:grid-cols-3" resetOnSuccess>
                  <input type="hidden" name="customerId" value={c.id} />
                  <TextField label={t("النقاط (+/−)")} name="points" inputMode="numeric" dir="ltr" required />
                  <TextField label={t("السبب")} name="reason" className="sm:col-span-2" required />
                  <div><SubmitButton size="sm" variant="secondary">{t("تعديل الرصيد")}</SubmitButton></div>
                </ActionForm>
              </CardBody>
            ) : null}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("بيانات التواصل")} />
            <CardBody>
              <DefinitionList items={[
                { label: t("الهاتف"), value: <span className="num" dir="ltr">{c.phone ?? "—"}</span> },
                { label: t("البريد"), value: c.email ?? "—" },
                { label: t("تأكيد البريد"), value: c.user ? (c.user.emailVerified ? t("مؤكد") : t("غير مؤكد")) : "—" },
                { label: t("الرسائل التسويقية"), value: c.marketingOptIn ? t("موافق") : t("غير موافق") },
              ]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("العناوين")} />
            <CardBody className="space-y-3 text-sm">
              {c.addresses.map((a) => (
                <address key={a.id} className="not-italic">
                  {a.isDefault ? <Badge tone="sun" className="mb-1">{t("افتراضي")}</Badge> : null}
                  <p>{a.fullName} · <span dir="ltr">{a.phone}</span></p>
                  <p className="text-ink-muted">{[a.street, a.area, a.city, t(a.governorate)].filter(Boolean).join(t("، "))}</p>
                </address>
              ))}
              {c.addresses.length === 0 ? <p className="text-ink-muted">{t("لا توجد عناوين")}</p> : null}
            </CardBody>
          </Card>
          {c.returns.length ? (
            <Card>
              <CardHeader title={t("المرتجعات")} />
              <CardBody className="space-y-2 text-sm">
                {c.returns.map((r) => <p key={r.id}><Link className="num text-sun-700 hover:underline" href={`/admin/returns/${r.id}`}>{r.number}</Link> <Badge tone={returnTone[r.status]}>{t(RETURN_STATUS_LABELS[r.status])}</Badge></p>)}
              </CardBody>
            </Card>
          ) : null}
          {notes ? (
            <Card>
              <CardHeader title={t("ملاحظات داخلية")} description={t("لا تظهر للعميل")} />
              <CardBody className="space-y-3">
                {notes.map((n) => <div key={n.id} className="rounded-md bg-surface-2 p-3 text-sm">{n.body}<p className="mt-1 text-xs text-ink-muted"><DateText value={n.createdAt} withTime /></p></div>)}
                <ActionForm action={customerNoteAction} className="space-y-2" resetOnSuccess>
                  <input type="hidden" name="customerId" value={c.id} />
                  <TextArea label={t("ملاحظة جديدة")} name="body" rows={2} required />
                  <SubmitButton size="sm" variant="secondary">{t("إضافة")}</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
