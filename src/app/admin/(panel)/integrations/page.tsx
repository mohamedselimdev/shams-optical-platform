import { requireStaffPage } from "@/server/auth/session";
import { env } from "@/server/env";
import { allProviders } from "@/modules/payments/registry";
import { storageConfigured } from "@/server/storage";
import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card, CardBody, CardHeader } from "@/ui/primitives";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("التكاملات") };
}

type Row = { name: string; state: "ok" | "sandbox" | "missing"; detail: string; vars?: string };

export default async function IntegrationsPage() {
  const t = await getT();
  await requireStaffPage("integrations.read");
  const providers = allProviders();
  const paymob = providers.find((p) => p.key === "paymob")!;
  const sandbox = providers.find((p) => p.key === "sandbox")!;
  const rows: Row[] = [
    { name: t("Paymob (بطاقات ومحافظ)"), state: paymob.configured ? "ok" : "missing", detail: paymob.configured ? t("مُعد. لم يُختبر على حساب حقيقي بعد؛ نفّذ عملية تجريبية قبل الإطلاق.") : t("REQUIRES_EXTERNAL_CONFIG: الدفع الإلكتروني الحقيقي غير متاح."), vars: "PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY, PAYMOB_HMAC_SECRET, PAYMOB_CARD_INTEGRATION_ID, PAYMOB_WALLET_INTEGRATION_ID" },
    { name: t("بيئة اختبار الدفع"), state: sandbox.configured ? "sandbox" : "missing", detail: sandbox.configured ? (env.NODE_ENV === "production" ? t("تحذير: مفعّلة في الإنتاج — يجب إيقافها.") : t("مفعّلة للتطوير والاختبار.")) : t("متوقفة."), vars: "PAYMENT_SANDBOX_ENABLED" },
    { name: t("البريد الإلكتروني"), state: env.RESEND_API_KEY ? "ok" : "missing", detail: env.RESEND_API_KEY ? t("Resend مُعد.") : env.NODE_ENV === "production" ? t("REQUIRES_EXTERNAL_CONFIG: إرسال البريد متوقف وستفشل رسائل التحقق.") : t("REQUIRES_EXTERNAL_CONFIG: في التطوير تُحفظ الرسائل في storage/dev-mail ولا تُرسل."), vars: "RESEND_API_KEY, EMAIL_FROM" },
    { name: t("الرسائل النصية / واتساب"), state: "missing", detail: t("PLANNED: لا يوجد ربط مع مزود رسائل نصية بعد؛ تُسجَّل الرسائل كـ«متخطاة» في سجل الإشعارات.") },
    { name: t("تخزين الملفات"), state: env.STORAGE_DRIVER === "s3" ? (storageConfigured() ? "ok" : "missing") : "sandbox", detail: env.STORAGE_DRIVER === "s3" ? (storageConfigured() ? t("S3 مُعد.") : t("S3 محدد لكن الإعداد ناقص؛ يُستخدم التخزين المحلي.")) : t("تخزين محلي على الخادم (مناسب لخادم واحد فقط)."), vars: "STORAGE_DRIVER=s3, S3_*" },
    { name: t("مراقبة الأخطاء"), state: "missing", detail: t("PLANNED: الأخطاء تُسجَّل في سجلات الخادم (JSON) مع رمز حادثة؛ لا يوجد ربط مع خدمة مراقبة خارجية بعد.") },
    { name: t("شركات الشحن"), state: "missing", detail: t("REQUIRES_EXTERNAL_CONFIG: لا يوجد ربط آلي مع Bosta/Aramex؛ أرقام التتبع تُدخل يدوياً."), vars: "—" },
  ];
  const tone = { ok: "success", sandbox: "warning", missing: "neutral" } as const;
  const label = { ok: t("مُعد"), sandbox: t("تجريبي/محلي"), missing: t("غير مُعد") };
  return (
    <>
      <PageHeader title={t("التكاملات")} description={t("حالة الخدمات الخارجية. المفاتيح تُضبط في متغيرات البيئة على الخادم ولا تُعرض هنا.")} />
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.name}>
            <CardHeader title={r.name} actions={<Badge tone={tone[r.state]}>{label[r.state]}</Badge>} />
            <CardBody className="space-y-2 text-sm">
              <p>{r.detail}</p>
              {r.vars ? <p className="num text-xs text-ink-muted" dir="ltr">{r.vars}</p> : null}
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
