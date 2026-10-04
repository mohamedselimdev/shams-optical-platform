import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffActor } from "@/server/auth/session";
import { ActionForm } from "@/ui/action-form";
import { TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { staffSignIn } from "./actions";

export const metadata: Metadata = { title: "تسجيل دخول الموظفين" };

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getStaffActor()) redirect("/admin");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sun-400 font-display text-xl font-bold text-ink">ش</span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-surface">لوحة عمليات شمس</h1>
          <p className="mt-1 text-sm text-surface/60">للموظفين المصرح لهم فقط</p>
        </div>
        <div className="rounded-xl bg-surface p-6 shadow-pop">
          <ActionForm action={staffSignIn} className="space-y-4">
            <input type="hidden" name="next" value={next ?? ""} />
            <TextField label="البريد الإلكتروني" name="email" type="email" autoComplete="username" dir="ltr" required />
            <TextField label="كلمة المرور" name="password" type="password" autoComplete="current-password" dir="ltr" required />
            <SubmitButton className="w-full" pendingLabel="جارٍ الدخول…">تسجيل الدخول</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}
