"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/server/action";
import { cartForWrite } from "@/server/storefront";
import { setCartCoupon, updateCartItem } from "@/modules/cart/service";

type R = ActionResult<unknown> | null;

export async function updateLineAction(_p: R, form: FormData): Promise<R> {
  const res = await runAction(async () => {
    const { cart } = await cartForWrite();
    const itemId = z.string().min(1).max(64).parse(form.get("itemId"));
    const quantity = z.coerce.number().int().min(0).max(50).parse(form.get("quantity"));
    await updateCartItem(cart.id, itemId, quantity);
  });
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function couponAction(_p: R, form: FormData): Promise<R> {
  const res = await runAction(async () => {
    const { cart } = await cartForWrite();
    const code = form.get("remove") ? null : z.string().trim().max(30).parse(form.get("code") ?? "") || null;
    await setCartCoupon(cart.id, code);
  });
  if (res.ok) revalidatePath("/cart");
  return res;
}
