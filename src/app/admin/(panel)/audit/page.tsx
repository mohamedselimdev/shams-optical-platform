import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { Card, DateText, EmptyState, Pagination, Table, Td, Th } from "@/ui/primitives";
import { buttonClass } from "@/ui/button";

export const metadata = { title: "سجل التدقيق" };

const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string; actor?: string; page?: string }> }) {
  const actor = await requireStaffPage("audit.read");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const where = {
    ...(sp.action ? { action: { startsWith: sp.action.slice(0, 40) } } : {}),
    ...(sp.entity ? { OR: [{ entityType: sp.entity.slice(0, 40) }, { entityId: sp.entity.slice(0, 64) }] } : {}),
    ...(sp.actor ? { actorId: sp.actor.slice(0, 64) } : {}),
    // Branch-scoped auditors only see entries for their branches.
    ...(actor.branchIds === "ALL" ? {} : { branchId: { in: [...actor.branchIds] } }),
  };
  const [rows, total] = await Promise.all([db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }), db.auditLog.count({ where })]);
  const users = new Map((await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const input = "h-9 rounded-md border border-line bg-surface px-2 text-sm";
  return (
    <>
      <PageHeader title="سجل التدقيق" description="سجل غير قابل للتعديل أو الحذف (محمي على مستوى قاعدة البيانات)." />
      <Card>
        <form method="get" className="flex flex-wrap gap-2 border-b border-line p-4">
          <input name="action" defaultValue={sp.action} placeholder="الإجراء (مثل price. أو order.)" className={input} dir="ltr" aria-label="الإجراء" />
          <input name="entity" defaultValue={sp.entity} placeholder="نوع أو معرّف الكيان" className={input} dir="ltr" aria-label="الكيان" />
          <button className={buttonClass("secondary", "sm")}>تصفية</button>
        </form>
        {rows.length ? (
          <Table>
            <thead><tr><Th>الوقت</Th><Th>المستخدم</Th><Th>الإجراء</Th><Th>الكيان</Th><Th>التفاصيل</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <Td className="whitespace-nowrap"><DateText value={r.createdAt} withTime /></Td>
                  <Td>{r.actorId ? users.get(r.actorId) ?? r.actorId.slice(-6) : r.actorType === "system" ? "النظام" : r.actorType}</Td>
                  <Td className="num text-xs" dir="ltr">{r.action}</Td>
                  <Td className="num text-xs" dir="ltr">{r.entityType}{r.entityId ? `:${r.entityId.slice(-10)}` : ""}</Td>
                  <Td>
                    {r.before || r.after || r.metadata ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-sun-700">عرض</summary>
                        <pre className="num mt-1 max-h-64 max-w-xl overflow-auto rounded bg-surface-2 p-2 text-[11px]" dir="ltr">{JSON.stringify({ before: r.before, after: r.after, metadata: r.metadata }, null, 2)}</pre>
                      </details>
                    ) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="لا توجد سجلات" />}
        <Pagination page={page} pageCount={Math.ceil(total / PAGE)} basePath="/admin/audit" params={{ action: sp.action, entity: sp.entity, actor: sp.actor }} />
      </Card>
    </>
  );
}
