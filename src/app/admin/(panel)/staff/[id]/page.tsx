import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { StaffForm } from "@/components/admin/staff-form";
import { actorBranches } from "@/components/admin/range";

export const metadata = { title: "تعديل موظف" };

export default async function EditStaff({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaffPage("staff.write");
  const { id } = await params;
  const staff = await db.staffProfile.findUnique({ where: { id }, include: { user: { select: { name: true, email: true, phone: true } }, roles: true, branches: true } });
  if (!staff) notFound();
  // Branch-scoped managers only see staff of their branches (the service enforces this again on save).
  if (actor.branchIds !== "ALL" && !staff.branches.some((b) => actor.branchIds.includes(b.branchId))) notFound();
  const [roles, branches] = await Promise.all([db.role.findMany({ orderBy: { name: "asc" } }), actorBranches(actor)]);
  return (
    <>
      <PageHeader back={{ href: "/admin/staff", label: "الموظفون" }} title={staff.user.name} />
      <StaffForm staff={staff} roles={roles} branches={branches} canAllBranches={actor.branchIds === "ALL"} />
    </>
  );
}
