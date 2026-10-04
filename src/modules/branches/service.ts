import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { type Actor, assertCan } from "@/server/rbac/actor";
import { conflict, notFound } from "@/server/errors";
import { zCheckbox, zOptionalText, zSlug, zText } from "@/lib/validation";

export const branchSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,12}$/, "كود الفرع غير صالح"),
  slug: zSlug,
  name: zText(120),
  nameEn: zOptionalText(120),
  type: z.enum(["STORE", "WAREHOUSE"]),
  governorate: zText(60),
  city: zText(60),
  addressLine: zText(300),
  phone: zOptionalText(30),
  email: zOptionalText(120),
  latitude: z.union([z.literal(""), z.coerce.number().min(-90).max(90)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  longitude: z.union([z.literal(""), z.coerce.number().min(-180).max(180)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  openingHours: zOptionalText(300),
  isActive: zCheckbox,
  pickupEnabled: zCheckbox,
  shipsOnline: zCheckbox,
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function saveBranch(actor: Actor, id: string | null, input: unknown) {
  assertCan(actor, "branches.write");
  const { openingHours, ...data } = branchSchema.parse(input);
  const payload = { ...data, openingHours: openingHours ? { text: openingHours } : undefined };
  return db.$transaction(async (tx) => {
    const dup = await tx.branch.findFirst({ where: { OR: [{ code: data.code }, { slug: data.slug }], ...(id ? { NOT: { id } } : {}) } });
    if (dup) throw conflict("كود الفرع أو الرابط مستخدم بالفعل");
    if (id) {
      const before = await tx.branch.findUnique({ where: { id } });
      if (!before) throw notFound("الفرع");
      const after = await tx.branch.update({ where: { id }, data: payload });
      await audit(tx, actor, { action: "branch.update", entityType: "branch", entityId: id, branchId: id, before, after });
      return after;
    }
    const created = await tx.branch.create({ data: payload });
    await audit(tx, actor, { action: "branch.create", entityType: "branch", entityId: created.id, branchId: created.id, after: created });
    return created;
  });
}

/** Branches the actor may see in the dashboard (all for staff with ALL scope). */
export async function listBranchesFor(actor: Actor) {
  assertCan(actor, "branches.read");
  const where = actor.kind === "staff" && actor.branchIds !== "ALL" ? { id: { in: [...actor.branchIds] } } : {};
  return db.branch.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

/** Public storefront list: active stores only, no internal fields. */
export async function listPublicBranches() {
  return db.branch.findMany({
    where: { isActive: true, type: "STORE" },
    select: { id: true, slug: true, name: true, governorate: true, city: true, addressLine: true, phone: true, latitude: true, longitude: true, openingHours: true, pickupEnabled: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
