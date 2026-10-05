import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { Money } from "@/ui/primitives";
import { sandboxPayAction } from "./actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("دفع تجريبي"), robots: { index: false } };
}

/**
 * Development stand-in for a provider's hosted payment page. It never asks for card data; choosing an
 * outcome sends a signed webhook through the same verification path a real provider uses.
 */
export default async function SandboxPay({ params }: { params: Promise<{ paymentId: string }> }) {
  const t = await getT();
  if (!env.PAYMENT_SANDBOX_ENABLED) notFound();
  const { paymentId } = await params;
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: { select: { number: true } } } });
  if (!payment || payment.provider !== "sandbox") notFound();
  const done = payment.status !== "PENDING";
  return (
    <div className="container-page max-w-md py-16">
      <div className="rounded-xl border-2 border-dashed border-warning bg-surface p-8 text-center">
        <p className="text-xs font-semibold tracking-widest text-warning">{t("SANDBOX — بيئة اختبار")}</p>
        <h1 className="mt-3 font-display text-2xl font-semibold">{t("صفحة دفع تجريبية")}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t("طلب")}{" "}<span className="num" dir="ltr">{payment.order.number}</span></p>
        <p className="mt-4 text-3xl font-semibold"><Money value={payment.amount} /></p>
        {done ? (
          <p className="mt-6 text-sm">{t("تمت معالجة هذه العملية بالفعل.")}</p>
        ) : (
          <ActionForm action={sandboxPayAction} className="mt-6 grid gap-2">
            <input type="hidden" name="paymentId" value={payment.id} />
            <SubmitButton name="outcome" value="SUCCEEDED" size="lg" pendingLabel={t("جارٍ المعالجة…")}>{t("محاكاة دفع ناجح")}</SubmitButton>
            <SubmitButton name="outcome" value="FAILED" variant="secondary" size="lg" pendingLabel={t("جارٍ المعالجة…")}>{t("محاكاة رفض البطاقة")}</SubmitButton>
          </ActionForm>
        )}
        <p className="mt-6 text-xs text-ink-muted">{t("لا تُدخل أي بيانات بطاقة حقيقية. في الإنتاج يتم التحويل إلى صفحة مزود الدفع المعتمد.")}</p>
      </div>
    </div>
  );
}
