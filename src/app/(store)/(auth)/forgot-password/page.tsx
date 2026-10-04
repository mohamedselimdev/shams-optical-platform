import Link from "next/link";
import { ActionForm } from "@/ui/action-form";
import { TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { requestReset } from "../actions";

export const metadata = { title: "استعادة كلمة المرور", robots: { index: false } };

export default function Forgot() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">استعادة كلمة المرور</h1>
      <p className="mt-1 text-sm text-ink-muted">أدخل بريدك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.</p>
      <ActionForm action={requestReset} className="mt-6 space-y-4">
        <TextField label="البريد الإلكتروني" name="email" type="email" dir="ltr" autoComplete="email" required />
        <SubmitButton className="w-full" size="lg" pendingLabel="جارٍ الإرسال…">إرسال الرابط</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="underline">العودة لتسجيل الدخول</Link></p>
    </>
  );
}
