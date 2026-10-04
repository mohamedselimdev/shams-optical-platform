"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { runAction, type ActionResult } from "@/server/action";
import { sandboxComplete } from "@/modules/payments/service";

type R = ActionResult<unknown> | null;

export async function sandboxPayAction(_p: R, form: FormData): Promise<R> {
  let target: string | null = null;
  const res = await runAction(async () => {
    const paymentId = z.string().min(1).max(64).parse(form.get("paymentId"));
    const outcome = z.enum(["SUCCEEDED", "FAILED"]).parse(form.get("outcome"));
    await sandboxComplete(paymentId, outcome);
    const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: { select: { number: true } } } });
    target = `/checkout/result?order=${encodeURIComponent(p.order.number)}${outcome === "FAILED" ? "&payment=failed" : ""}`;
  });
  if (res.ok && target) redirect(target);
  return res;
}
