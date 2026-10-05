import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { PERMISSIONS, type Permission } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader } from "@/ui/primitives";
import { saveRoleAction } from "../staff/actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("الأدوار والصلاحيات") };
}

const GROUPS: [string, string][] = [["dashboard", "اللوحة"], ["orders", "الطلبات"], ["payments", "المدفوعات"], ["catalog", "الكتالوج"], ["lenses", "العدسات"], ["inventory", "المخزون"], ["transfers", "التحويلات"], ["branches", "الفروع"], ["suppliers", "الموردون"], ["purchasing", "المشتريات"], ["customers", "العملاء"], ["prescriptions", "الوصفات"], ["returns", "المرتجعات"], ["promotions", "العروض"], ["loyalty", "الولاء"], ["reviews", "التقييمات"], ["shipping", "الشحن"], ["staff", "الموظفون"], ["roles", "الأدوار"], ["cms", "المحتوى"], ["analytics", "التحليلات"], ["reports", "التقارير"], ["audit", "التدقيق"], ["settings", "الإعدادات"], ["integrations", "التكاملات"], ["system", "النظام"], ["pos", "نقطة البيع"], ["notifications", "الإشعارات"]];

async function RoleForm({ role, held }: { role?: { id: string; key: string; name: string; description: string | null; isSystem: boolean; permissions: { permission: string }[] }; held: Set<string> }) {
  const t = await getT();
  const has = new Set(role?.permissions.map((p) => p.permission));
  const locked = role?.key === "owner";
  return (
    <ActionForm action={saveRoleAction} className="space-y-4" resetOnSuccess={!role}>
      {role ? <input type="hidden" name="id" value={role.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label={t("الاسم")} name="name" defaultValue={role?.name} required disabled={locked} />
        <TextField label={t("المفتاح")} name="key" defaultValue={role?.key} dir="ltr" required readOnly={role?.isSystem} />
        <TextField label={t("الوصف")} name="description" defaultValue={role?.description ?? ""} disabled={locked} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {GROUPS.map(([g, label]) => {
          const perms = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => p.split(".")[0] === g);
          if (!perms.length) return null;
          return (
            <fieldset key={g} className="rounded-md border border-line p-3">
              <legend className="px-1 text-xs font-semibold text-ink-muted">{t(label)}</legend>
              <div className="space-y-1.5">
                {perms.map((p) => <CheckboxField key={p} name="permissions[]" value={p} label={t(PERMISSIONS[p])} defaultChecked={has.has(p)} disabled={locked || !held.has(p)} />)}
              </div>
            </fieldset>
          );
        })}
      </div>
      {locked ? <p className="text-xs text-ink-muted">{t("دور المالك يملك كل الصلاحيات ولا يُعدَّل.")}</p> : <SubmitButton size="sm">{role ? t("حفظ الدور") : t("إنشاء الدور")}</SubmitButton>}
    </ActionForm>
  );
}

export default async function RolesPage() {
  const t = await getT();
  const actor = await requireStaffPage("roles.write");
  const roles = await db.role.findMany({ include: { permissions: true, _count: { select: { staff: true } } }, orderBy: [{ isSystem: "desc" }, { name: "asc" }] });
  const held = new Set<string>(actor.permissions);
  return (
    <>
      <PageHeader title={t("الأدوار والصلاحيات")} description={t("الصلاحيات تُفرض على الخادم في كل صفحة وإجراء. الخانات غير المتاحة صلاحيات لا تملكها ولا يمكنك منحها.")} />
      <div className="space-y-3">
        {roles.map((r) => (
          <Card key={r.id}>
            <details>
              <summary className="flex cursor-pointer items-center gap-3 px-5 py-4">
                <span className="font-medium">{t(r.name)}</span>
                {r.isSystem ? <Badge tone="info">{t("نظام")}</Badge> : null}
                <span className="ms-auto text-xs text-ink-muted">{t("{0} صلاحية · {1} موظف", [t.number(r.permissions.length), t.number(r._count.staff)])}</span>
              </summary>
              <CardBody className="border-t border-line"><RoleForm role={r} held={held} /></CardBody>
            </details>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader title={t("دور جديد")} />
        <CardBody><RoleForm held={held} /></CardBody>
      </Card>
    </>
  );
}
