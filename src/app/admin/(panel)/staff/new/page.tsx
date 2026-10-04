import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { StaffForm } from "@/components/admin/staff-form";
import { actorBranches } from "@/components/admin/range";

export const metadata = { title: "موظف جديد" };

export default async function NewStaff() {
  const actor = await requireStaffPage("staff.write");
  const [roles, branches] = await Promise.all([db.role.findMany({ orderBy: { name: "asc" } }), actorBranches(actor)]);
  return (
    <>
      <PageHeader back={{ href: "/admin/staff", label: "الموظفون" }} title="موظف جديد" />
      <StaffForm roles={roles} branches={branches} canAllBranches={actor.branchIds === "ALL"} />
    </>
  );
}
