"use server";

import { redirect } from "next/navigation";
import { formToNested, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { placePosSale } from "@/modules/pos/service";
import { resolveSkuLines } from "@/components/admin/resolve-skus";

type R = ActionResult<unknown> | null;

export async function posSaleAction(_p: R, form: FormData): Promise<R> {
  let target: string | null = null;
  const res = await runAction(async () => {
    const actor = await requireStaff("pos.use");
    const d = formToNested(form);
    const lines = await resolveSkuLines(d.lines);
    const sale = await placePosSale(actor, {
      idempotencyKey: String(d.idempotencyKey ?? ""),
      branchId: String(d.branchId ?? ""),
      items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) as never,
      customerPhone: String(d.customerPhone ?? ""),
      customerName: String(d.customerName ?? ""),
      couponCode: String(d.couponCode ?? ""),
      paymentMethod: String(d.paymentMethod ?? "") as never,
      cashTendered: String(d.cashTendered ?? ""),
      cardReference: String(d.cardReference ?? ""),
      note: String(d.note ?? ""),
    });
    target = `/admin/pos?branch=${encodeURIComponent(String(d.branchId))}&sale=${sale.orderId}`;
  });
  if (res.ok && target) redirect(target);
  return res;
}
