import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { type Actor, assertCan } from "@/server/rbac/actor";
import { zCheckbox, zOptionalEgp, zEgp, zText, zOptionalText } from "@/lib/validation";
import { invalid, notFound } from "@/server/errors";

export async function lensAdminData(actor: Actor) {
  assertCan(actor, "lenses.write");
  const [types, indexes, prices, options] = await Promise.all([
    db.lensType.findMany({ orderBy: { sortOrder: "asc" }, include: { optionRules: true } }),
    db.lensIndex.findMany({ orderBy: { sortOrder: "asc" } }),
    db.lensPackagePrice.findMany(),
    db.lensOption.findMany({ orderBy: [{ group: "asc" }, { sortOrder: "asc" }] }),
  ]);
  return { types, indexes, prices, options };
}

/**
 * Save the type × index price matrix. Cells are "price.<typeId>.<indexId>" (EGP); an empty cell
 * marks the combination unavailable. Existing order snapshots are unaffected.
 */
export async function saveLensMatrix(actor: Actor, cells: Record<string, unknown>) {
  assertCan(actor, "lenses.write");
  const [types, indexes, existing] = await Promise.all([db.lensType.findMany({ select: { id: true } }), db.lensIndex.findMany({ select: { id: true } }), db.lensPackagePrice.findMany()]);
  const changes: { typeId: string; indexId: string; before: number | null; after: number | null }[] = [];
  await db.$transaction(async (tx) => {
    for (const t of types) {
      for (const ix of indexes) {
        const raw = cells[`${t.id}.${ix.id}`];
        if (raw === undefined) continue;
        const parsed = zOptionalEgp.safeParse(raw);
        if (!parsed.success) throw invalid("سعر غير صالح في جدول الأسعار");
        const price = parsed.data;
        const prev = existing.find((p) => p.lensTypeId === t.id && p.lensIndexId === ix.id);
        const before = prev?.isActive ? prev.price : null;
        if (before === price) continue;
        if (price === null) {
          if (prev) await tx.lensPackagePrice.update({ where: { lensTypeId_lensIndexId: { lensTypeId: t.id, lensIndexId: ix.id } }, data: { isActive: false } });
        } else {
          await tx.lensPackagePrice.upsert({
            where: { lensTypeId_lensIndexId: { lensTypeId: t.id, lensIndexId: ix.id } },
            update: { price, isActive: true },
            create: { lensTypeId: t.id, lensIndexId: ix.id, price },
          });
        }
        changes.push({ typeId: t.id, indexId: ix.id, before, after: price });
      }
    }
    if (changes.length) await audit(tx, actor, { action: "lens.update", entityType: "lens_package_price", entityId: "matrix", after: { changes } });
  });
  return changes.length;
}

export const lensOptionSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{2,40}$/, "مفتاح غير صالح"),
  name: zText(80),
  description: zOptionalText(300),
  group: z.enum(["COATING", "BLUE_LIGHT", "PHOTOCHROMIC", "TINT", "POLARIZATION"]),
  price: zEgp,
  exclusive: zCheckbox,
  isActive: zCheckbox,
  lensTypeIds: z.array(z.string()).default([]),
});

export async function saveLensOption(actor: Actor, id: string | null, input: unknown) {
  assertCan(actor, "lenses.write");
  const { lensTypeIds, ...data } = lensOptionSchema.parse(input);
  return db.$transaction(async (tx) => {
    const before = id ? await tx.lensOption.findUnique({ where: { id } }) : null;
    if (id && !before) throw notFound("خيار العدسة");
    const opt = id ? await tx.lensOption.update({ where: { id }, data }) : await tx.lensOption.create({ data });
    await tx.lensOptionRule.deleteMany({ where: { optionId: opt.id } });
    if (lensTypeIds.length) await tx.lensOptionRule.createMany({ data: lensTypeIds.map((lensTypeId) => ({ optionId: opt.id, lensTypeId })) });
    await audit(tx, actor, { action: "lens.update", entityType: "lens_option", entityId: opt.id, before: before ?? undefined, after: { ...data, lensTypeIds } });
    return opt;
  });
}

export async function setLensActive(actor: Actor, kind: "type" | "index", id: string, isActive: boolean) {
  assertCan(actor, "lenses.write");
  const row = kind === "type" ? await db.lensType.update({ where: { id }, data: { isActive } }) : await db.lensIndex.update({ where: { id }, data: { isActive } });
  await audit(db, actor, { action: "lens.update", entityType: kind === "type" ? "lens_type" : "lens_index", entityId: id, after: { isActive } });
  return row;
}
