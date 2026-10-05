import { requireCustomerPage } from "@/server/auth/session";
import { listCustomerOrders } from "@/modules/orders/service";
import { OrdersTable } from "../orders-table";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("طلباتي") };
}

export default async function MyOrders() {
  const t = await getT();
  const actor = await requireCustomerPage("/account/orders");
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">{t("طلباتي")}</h1>
      <OrdersTable orders={await listCustomerOrders(actor.customerId)} />
    </div>
  );
}
