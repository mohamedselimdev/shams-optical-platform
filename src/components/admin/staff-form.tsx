import { ActionForm } from "@/ui/action-form";
import { CheckboxField, SelectField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Card, CardBody, CardHeader } from "@/ui/primitives";
import { saveStaffAction } from "@/app/admin/(panel)/staff/actions";
import { getT } from "@/i18n/server";

type Staff = { id: string; employeeCode: string; jobTitle: string | null; isActive: boolean; allBranches: boolean; defaultBranchId: string | null; user: { name: string; email: string; phone: string | null }; roles: { roleId: string }[]; branches: { branchId: string }[] };

export async function StaffForm({ staff, roles, branches, canAllBranches }: { staff?: Staff; roles: { id: string; name: string; key: string }[]; branches: { id: string; name: string }[]; canAllBranches: boolean }) {
  const t = await getT();
  return (
    <ActionForm action={saveStaffAction} className="grid gap-6 xl:grid-cols-3">
      {staff ? <input type="hidden" name="staffId" value={staff.id} /> : null}
      <Card className="xl:col-span-2">
        <CardHeader title={t("البيانات")} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("الاسم")} name="name" defaultValue={staff?.user.name} required />
          <TextField label={t("البريد (اسم الدخول)")} name="email" type="email" defaultValue={staff?.user.email} dir="ltr" required />
          <TextField label={t("الهاتف")} name="phone" defaultValue={staff?.user.phone ?? ""} dir="ltr" />
          <TextField label={t("كود الموظف")} name="employeeCode" defaultValue={staff?.employeeCode} dir="ltr" required />
          <TextField label={t("المسمى الوظيفي")} name="jobTitle" defaultValue={staff?.jobTitle ?? ""} />
          <TextField label={staff ? t("كلمة مرور جديدة (اختياري)") : t("كلمة المرور")} name="password" type="password" autoComplete="new-password" dir="ltr" required={!staff} hint={t("10 أحرف على الأقل")} />
          <CheckboxField name="isActive" label={t("الحساب نشط")} defaultChecked={staff?.isActive ?? true} />
        </CardBody>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader title={t("الأدوار")} description={t("لا يمكنك منح صلاحيات لا تملكها.")} />
          <CardBody className="space-y-2">
            {roles.map((r) => <CheckboxField key={r.id} name="roleIds[]" value={r.id} label={t(r.name)} defaultChecked={staff?.roles.some((x) => x.roleId === r.id)} />)}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("الفروع")} />
          <CardBody className="space-y-2">
            {canAllBranches ? <CheckboxField name="allBranches" label={t("كل الفروع")} defaultChecked={staff?.allBranches} /> : null}
            {branches.map((b) => <CheckboxField key={b.id} name="branchIds[]" value={b.id} label={b.name} defaultChecked={staff?.branches.some((x) => x.branchId === b.id)} />)}
            <SelectField label={t("الفرع الافتراضي")} name="defaultBranchId" defaultValue={staff?.defaultBranchId ?? ""} options={branches.map((b) => ({ value: b.id, label: b.name }))} placeholder="—" />
          </CardBody>
        </Card>
        <SubmitButton className="w-full">{t("حفظ")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
