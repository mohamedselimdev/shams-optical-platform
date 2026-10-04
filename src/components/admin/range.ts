import "server-only";
import type { StaffActor } from "@/server/rbac/actor";
import { db } from "@/server/db";

export type RangeParams = { from?: string; to?: string; branch?: string };

import { addDays, cairoDate, cairoDayEnd, cairoDayStart } from "@/lib/cairo-time";

/** Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=… into an inclusive range in Cairo business days (default: last 30 days, max 366). */
export function parseRange(sp: RangeParams) {
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined);
  let toStr = valid(sp.to) ?? cairoDate();
  let fromStr = valid(sp.from) ?? addDays(toStr, -29);
  if (fromStr > toStr) fromStr = toStr;
  if (addDays(fromStr, 366) < toStr) toStr = addDays(fromStr, 366);
  return { from: cairoDayStart(fromStr), to: cairoDayEnd(toStr), fromStr, toStr, branchId: sp.branch || null };
}

/** Branches visible to the actor, for filter dropdowns. */
export async function actorBranches(actor: StaffActor) {
  return db.branch.findMany({
    where: actor.branchIds === "ALL" ? {} : { id: { in: [...actor.branchIds] } },
    select: { id: true, name: true, code: true, type: true },
    orderBy: { name: "asc" },
  });
}
