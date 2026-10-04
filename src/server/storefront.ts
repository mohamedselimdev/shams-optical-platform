import "server-only";
import { cookies } from "next/headers";
import { db } from "./db";
import { env } from "./env";
import { getCustomerActor } from "./auth/session";
import { CART_COOKIE, ensureCart, findActiveCart } from "@/modules/cart/service";

/**
 * Storefront request context: the shopper's cart (cookie token for guests, customer id once signed in)
 * and recent guest orders. Cookie writes are only legal in server actions and route handlers.
 */
const cookieBase = { httpOnly: true, sameSite: "lax" as const, secure: env.NODE_ENV === "production", path: "/" };

export async function readCartToken() {
  return (await cookies()).get(CART_COOKIE)?.value ?? null;
}

/** Read-only cart for rendering (never creates one). */
export async function currentCart() {
  const [token, actor] = await Promise.all([readCartToken(), getCustomerActor()]);
  return findActiveCart(db, { token, customerId: actor?.customerId ?? null });
}

/** Cart for a mutation; creates it and sets the cookie when needed. Server actions only. */
export async function cartForWrite() {
  const [token, actor] = await Promise.all([readCartToken(), getCustomerActor()]);
  const cart = await ensureCart({ token, customerId: actor?.customerId ?? null });
  if (cart.token !== token) (await cookies()).set(CART_COOKIE, cart.token, { ...cookieBase, maxAge: 60 * 60 * 24 * 30 });
  return { cart, actor };
}

export async function cartCount() {
  const cart = await currentCart();
  return cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
}

/**
 * Guest checkouts can view their own order confirmation: the order id (unguessable cuid) is kept in an
 * HttpOnly cookie for a day. Signed-in customers are authorised by ownership instead.
 */
const GUEST_ORDERS_COOKIE = "shams_guest_orders";

export async function rememberGuestOrder(orderId: string) {
  const jar = await cookies();
  const ids = (jar.get(GUEST_ORDERS_COOKIE)?.value ?? "").split(".").filter(Boolean);
  const next = [orderId, ...ids.filter((i) => i !== orderId)].slice(0, 5);
  jar.set(GUEST_ORDERS_COOKIE, next.join("."), { ...cookieBase, maxAge: 60 * 60 * 24 });
}

export async function guestOrderIds() {
  return ((await cookies()).get(GUEST_ORDERS_COOKIE)?.value ?? "").split(".").filter(Boolean);
}

/** Order visible to the current shopper (owner or same-browser guest), by number. */
export async function findShopperOrder(number: string) {
  const actor = await getCustomerActor();
  const guestIds = await guestOrderIds();
  return db.order.findFirst({
    where: { number, OR: [...(actor ? [{ customerId: actor.customerId }] : []), ...(guestIds.length ? [{ id: { in: guestIds } }] : [])] },
    include: {
      items: true,
      events: { where: { isPublic: true }, orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, method: true, provider: true, redirectUrl: true, amount: true } },
      pickupBranch: { select: { name: true, addressLine: true, city: true, phone: true } },
      shipments: { select: { carrier: true, trackingNumber: true, status: true } },
    },
  });
}
