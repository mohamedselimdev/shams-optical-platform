import { requireCustomerPage } from "@/server/auth/session";
import { listCustomerOrders } from "@/modules/orders/service";
import { OrdersTable } from "../orders-table";

export const metadata = { title: "طلباتي" };

export default async function MyOrders() {
  const actor = await requireCustomerPage("/account/orders");
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">طلباتي</h1>
      <OrdersTable orders={await listCustomerOrders(actor.customerId)} />
    </div>
  );
}
