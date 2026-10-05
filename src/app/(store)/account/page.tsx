import Link from "next/link";
import { db } from "@/server/db";
import { requireCustomerPage } from "@/server/auth/session";
import { listCustomerOrders } from "@/modules/orders/service";
import { loyaltyBalance } from "@/modules/loyalty/service";
import { OrdersTable } from "./orders-table";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("حسابي") };
}

export default async function AccountHome({ searchParams }: { searchParams: Promise<{ verified?: string; welcome?: string }> }) {
  const t = await getT();
  const actor = await requireCustomerPage();
  const sp = await searchParams;
  const [orders, balance, user, rxCount] = await Promise.all([
    listCustomerOrders(actor.customerId),
    loyaltyBalance(actor.customerId),
    db.user.findUnique({ where: { id: actor.userId }, select: { emailVerified: true } }),
    db.prescription.count({ where: { customerId: actor.customerId, isArchived: false } }),
  ]);
  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-semibold">{t("حسابي")}</h1>
      {sp.welcome ? <p role="status" className="rounded-md bg-success-soft p-3 text-sm text-success">{t("أهلاً بك في شمس! تم إنشاء حسابك.")}</p> : null}
      {sp.verified ? <p role="status" className="rounded-md bg-success-soft p-3 text-sm text-success">{t("تم تأكيد بريدك الإلكتروني.")}</p> : null}
      {user && !user.emailVerified ? <p className="rounded-md bg-warning-soft p-3 text-sm text-warning">{t("لم يتم تأكيد بريدك الإلكتروني بعد. تحقق من صندوق الوارد للحصول على رابط التأكيد.")}</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/account/orders" className="rounded-lg border border-line bg-surface p-4 hover:border-ink"><p className="text-xs text-ink-muted">{t("الطلبات")}</p><p className="num mt-1 text-2xl font-semibold">{orders.length}</p></Link>
        <Link href="/account/loyalty" className="rounded-lg border border-line bg-surface p-4 hover:border-ink"><p className="text-xs text-ink-muted">{t("نقاط الولاء")}</p><p className="num mt-1 text-2xl font-semibold">{balance}</p></Link>
        <Link href="/account/prescriptions" className="rounded-lg border border-line bg-surface p-4 hover:border-ink"><p className="text-xs text-ink-muted">{t("الوصفات المحفوظة")}</p><p className="num mt-1 text-2xl font-semibold">{rxCount}</p></Link>
      </div>
      <section>
        <h2 className="mb-3 font-semibold">{t("أحدث الطلبات")}</h2>
        <OrdersTable orders={orders.slice(0, 5)} />
      </section>
    </div>
  );
}
