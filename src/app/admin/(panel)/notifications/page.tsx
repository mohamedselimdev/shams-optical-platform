import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardHeader, DateText, EmptyState, Table, Td, Th } from "@/ui/primitives";
import { markAllReadAction } from "./actions";

export const metadata = { title: "الإشعارات" };

export default async function NotificationsPage() {
  const actor = await requireStaffPage("notifications.read");
  const mine = await db.notification.findMany({ where: { staffUserId: actor.userId, channel: "IN_APP" }, orderBy: { createdAt: "desc" }, take: 50 });
  // Outbound customer messages (status only; bodies are not shown to keep the log minimal).
  const outbound = can(actor, "orders.update") ? await db.notification.findMany({ where: { channel: { in: ["EMAIL", "SMS"] } }, select: { id: true, channel: true, template: true, status: true, error: true, createdAt: true, sentAt: true }, orderBy: { createdAt: "desc" }, take: 30 }) : null;
  return (
    <>
      <PageHeader title="الإشعارات" actions={mine.some((n) => !n.readAt) ? <ActionForm action={markAllReadAction} showSuccess={false}><SubmitButton size="sm" variant="secondary">تعليم الكل كمقروء</SubmitButton></ActionForm> : null} />
      <Card>
        {mine.length ? (
          <ul className="divide-y divide-line">
            {mine.map((n) => {
              const orderId = (n.data as { orderId?: string } | null)?.orderId;
              return (
                <li key={n.id} className={`flex items-center gap-3 px-5 py-3 text-sm ${n.readAt ? "" : "bg-sun-50"}`}>
                  {!n.readAt ? <span className="h-2 w-2 rounded-full bg-sun-500" aria-label="غير مقروء" /> : null}
                  <span className="font-medium">{n.subject}</span>
                  <span className="text-ink-muted">{n.body}</span>
                  {orderId ? <Link className="text-sun-700 hover:underline" href={`/admin/orders/${orderId}`}>فتح الطلب</Link> : null}
                  <span className="ms-auto text-xs text-ink-muted"><DateText value={n.createdAt} withTime /></span>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState title="لا توجد إشعارات" />}
      </Card>
      {outbound ? (
        <Card className="mt-6">
          <CardHeader title="رسائل العملاء الصادرة" description="الرسائل النصية متوقفة حتى ربط مزود (REQUIRES_EXTERNAL_CONFIG)." />
          <Table>
            <thead><tr><Th>القناة</Th><Th>القالب</Th><Th>الحالة</Th><Th>الوقت</Th></tr></thead>
            <tbody>
              {outbound.map((n) => (
                <tr key={n.id}>
                  <Td>{n.channel === "EMAIL" ? "بريد" : "رسالة نصية"}</Td>
                  <Td className="num text-xs">{n.template}</Td>
                  <Td><Badge tone={n.status === "SENT" ? "success" : n.status === "FAILED" ? "danger" : "neutral"}>{n.status}</Badge>{n.error ? <span className="block text-xs text-ink-muted">{n.error}</span> : null}</Td>
                  <Td><DateText value={n.createdAt} withTime /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
