import { ActionForm } from "@/ui/action-form";
import { CheckboxField, SelectField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Card, CardBody, CardHeader } from "@/ui/primitives";
import { saveStaffAction } from "@/app/admin/(panel)/staff/actions";

type Staff = { id: string; employeeCode: string; jobTitle: string | null; isActive: boolean; allBranches: boolean; defaultBranchId: string | null; user: { name: string; email: string; phone: string | null }; roles: { roleId: string }[]; branches: { branchId: string }[] };

export function StaffForm({ staff, roles, branches, canAllBranches }: { staff?: Staff; roles: { id: string; name: string; key: string }[]; branches: { id: string; name: string }[]; canAllBranches: boolean }) {
  return (
    <ActionForm action={saveStaffAction} className="grid gap-6 xl:grid-cols-3">
      {staff ? <input type="hidden" name="staffId" value={staff.id} /> : null}
      <Card className="xl:col-span-2">
        <CardHeader title="البيانات" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextField label="الاسم" name="name" defaultValue={staff?.user.name} required />
          <TextField label="البريد (اسم الدخول)" name="email" type="email" defaultValue={staff?.user.email} dir="ltr" required />
          <TextField label="الهاتف" name="phone" defaultValue={staff?.user.phone ?? ""} dir="ltr" />
          <TextField label="كود الموظف" name="employeeCode" defaultValue={staff?.employeeCode} dir="ltr" required />
          <TextField label="المسمى الوظيفي" name="jobTitle" defaultValue={staff?.jobTitle ?? ""} />
          <TextField label={staff ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور"} name="password" type="password" autoComplete="new-password" dir="ltr" required={!staff} hint="10 أحرف على الأقل" />
          <CheckboxField name="isActive" label="الحساب نشط" defaultChecked={staff?.isActive ?? true} />
        </CardBody>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader title="الأدوار" description="لا يمكنك منح صلاحيات لا تملكها." />
          <CardBody className="space-y-2">
            {roles.map((r) => <CheckboxField key={r.id} name="roleIds[]" value={r.id} label={r.name} defaultChecked={staff?.roles.some((x) => x.roleId === r.id)} />)}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="الفروع" />
          <CardBody className="space-y-2">
            {canAllBranches ? <CheckboxField name="allBranches" label="كل الفروع" defaultChecked={staff?.allBranches} /> : null}
            {branches.map((b) => <CheckboxField key={b.id} name="branchIds[]" value={b.id} label={b.name} defaultChecked={staff?.branches.some((x) => x.branchId === b.id)} />)}
            <SelectField label="الفرع الافتراضي" name="defaultBranchId" defaultValue={staff?.defaultBranchId ?? ""} options={branches.map((b) => ({ value: b.id, label: b.name }))} placeholder="—" />
          </CardBody>
        </Card>
        <SubmitButton className="w-full">حفظ</SubmitButton>
      </div>
    </ActionForm>
  );
}
