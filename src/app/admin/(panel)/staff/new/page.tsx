import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { StaffForm } from "@/components/admin/staff-form";
import { actorBranches } from "@/components/admin/range";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("موظف جديد") };
}

export default async function NewStaff() {
  const t = await getT();
  const actor = await requireStaffPage("staff.write");
  const [roles, branches] = await Promise.all([db.role.findMany({ orderBy: { name: "asc" } }), actorBranches(actor)]);
  return (
    <>
      <PageHeader back={{ href: "/admin/staff", label: t("الموظفون") }} title={t("موظف جديد")} />
      <StaffForm roles={roles} branches={branches} canAllBranches={actor.branchIds === "ALL"} />
    </>
  );
}
