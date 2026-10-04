import Link from "next/link";
import { ORDER_STATUS_LABELS } from "@/i18n/labels";
import { orderTone } from "@/i18n/tones";
import { Badge, DateText, EmptyState, Money, Table, Td, Th } from "@/ui/primitives";
import { ButtonLink } from "@/ui/button";
import type { listCustomerOrders } from "@/modules/orders/service";

export function OrdersTable({ orders }: { orders: Awaited<ReturnType<typeof listCustomerOrders>> }) {
  if (!orders.length) return <EmptyState title="لا توجد طلبات بعد" action={<ButtonLink href="/shop">ابدأ التسوق</ButtonLink>} />;
  return (
    <div className="rounded-lg border border-line bg-surface">
      <Table>
        <thead><tr><Th>رقم الطلب</Th><Th>التاريخ</Th><Th>الحالة</Th><Th>الإجمالي</Th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <Td dir="ltr" className="num text-start"><Link href={`/account/orders/${o.number}`} className="font-medium underline">{o.number}</Link></Td>
              <Td><DateText value={o.placedAt} /></Td>
              <Td><Badge tone={orderTone[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge></Td>
              <Td><Money value={o.total} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
