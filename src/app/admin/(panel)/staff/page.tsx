import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card, DateText, Table, Td, Th } from "@/ui/primitives";
import { ButtonLink } from "@/ui/button";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("الموظفون") };
}

export default async function StaffPage() {
  const t = await getT();
  const actor = await requireStaffPage("staff.read");
  const staff = await db.staffProfile.findMany({
    where: actor.branchIds === "ALL" ? {} : { OR: [{ branches: { some: { branchId: { in: [...actor.branchIds] } } } }, { userId: actor.userId }] },
    include: { user: { select: { name: true, email: true, lockedUntil: true } }, roles: { include: { role: { select: { name: true } } } }, branches: { include: { branch: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const sessions = await db.session.groupBy({ by: ["userId"], _max: { updatedAt: true }, where: { userId: { in: staff.map((s) => s.userId) } } });
  const last = new Map(sessions.map((s) => [s.userId, s._max.updatedAt]));
  return (
    <>
      <PageHeader title={t("الموظفون")} actions={can(actor, "staff.write") ? <ButtonLink href="/admin/staff/new" size="sm">{t("موظف جديد")}</ButtonLink> : null} />
      <Card>
        <Table>
          <thead><tr><Th>{t("الموظف")}</Th><Th>{t("الكود")}</Th><Th>{t("الأدوار")}</Th><Th>{t("الفروع")}</Th><Th>{t("الحالة")}</Th><Th>{t("آخر نشاط")}</Th></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <Td>{can(actor, "staff.write") ? <Link className="font-medium text-sun-700 hover:underline" href={`/admin/staff/${s.id}`}>{s.user.name}</Link> : s.user.name}<p className="text-xs text-ink-muted" dir="ltr">{s.user.email}</p></Td>
                <Td className="num">{s.employeeCode}</Td>
                <Td className="text-xs">{s.roles.map((r) => t(r.role.name)).join(t("، "))}</Td>
                <Td className="text-xs">{s.allBranches ? t("كل الفروع") : s.branches.map((b) => b.branch.name).join(t("، ")) || "—"}</Td>
                <Td>{!s.isActive ? <Badge tone="neutral">{t("موقوف")}</Badge> : s.user.lockedUntil && s.user.lockedUntil > new Date() ? <Badge tone="danger">{t("مقفل مؤقتاً")}</Badge> : <Badge tone="success">{t("نشط")}</Badge>}</Td>
                <Td>{last.get(s.userId) ? <DateText value={last.get(s.userId)!} withTime /> : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
