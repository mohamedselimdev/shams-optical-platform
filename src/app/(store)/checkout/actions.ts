"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { formToNested, runAction, type ActionResult } from "@/server/action";
import { getCustomerActor } from "@/server/auth/session";
import { findShopperOrder, readCartToken, rememberGuestOrder } from "@/server/storefront";
import { enforceRateLimit, clientIp } from "@/server/rate-limit";
import { invalidState, notFound } from "@/server/errors";
import { placeOrder } from "@/modules/checkout/service";
import { findActiveCart } from "@/modules/cart/service";
import { initiateOnlinePayment } from "@/modules/payments/service";

type R = ActionResult<unknown> | null;

/**
 * Place the order from the shopper's cart. Online payments are initiated server-side and the shopper is
 * redirected to the provider's hosted page; the order is only marked paid by a verified webhook.
 */
export async function placeOrderAction(_p: R, form: FormData): Promise<R> {
  let target: string | null = null;
  const res = await runAction(async () => {
    await enforceRateLimit(`checkout:${await clientIp()}`, 15, 600);
    const actor = await getCustomerActor();
    const d = formToNested(form) as Record<string, unknown>;
    // Recipient defaults to the contact person when left blank.
    if (d.address && typeof d.address === "object") {
      const a = d.address as Record<string, unknown>;
      if (!a.fullName) a.fullName = d.contactName;
      if (!a.phone) a.phone = d.contactPhone;
    }
    const sid = (await cookies()).get("shams_sid")?.value;
    const cartToken = await readCartToken();
    // The coupon is the one applied on the cart page (re-validated inside placeOrder).
    const cart = await findActiveCart(db, { token: cartToken, customerId: actor?.customerId ?? null });
    const result = await placeOrder(
      { actor, customerId: actor?.customerId ?? null, cartToken },
      {
        ...(d as object),
        address: d.addressId ? undefined : (d.address as never),
        couponCode: cart?.couponCode ?? undefined,
        loyaltyPoints: (d.loyaltyPoints as string) || 0,
        analyticsSessionId: sid,
      } as never,
    );
    if (!actor) await rememberGuestOrder(result.orderId);
    target = `/checkout/result?order=${encodeURIComponent(result.number)}`;
    if (result.requiresOnlinePayment) {
      try {
        const payment = await initiateOnlinePayment(result.orderId, result.paymentMethod);
        if (payment.redirectUrl) target = payment.redirectUrl;
      } catch {
        // The order exists and holds its stock reservation; the result page offers a retry.
        target = `/checkout/result?order=${encodeURIComponent(result.number)}&payment=failed`;
      }
    }
  });
  if (res.ok && target) {
    revalidatePath("/", "layout");
    redirect(target);
  }
  return res;
}

/** Retry an online payment for a pending order the shopper owns. */
export async function retryPaymentAction(_p: R, form: FormData): Promise<R> {
  let target: string | null = null;
  const res = await runAction(async () => {
    const number = z.string().min(3).max(40).parse(form.get("order"));
    const order = await findShopperOrder(number);
    if (!order) throw notFound("الطلب");
    if (order.status !== "PENDING_PAYMENT") throw invalidState("الطلب لا ينتظر الدفع");
    const payment = await initiateOnlinePayment(order.id, order.paymentMethod);
    target = payment.redirectUrl ?? `/checkout/result?order=${encodeURIComponent(number)}`;
  });
  if (res.ok && target) redirect(target);
  return res;
}
