import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { type Actor, assertCan } from "@/server/rbac/actor";
import { conflict, notFound } from "@/server/errors";
import { zCheckbox, zOptionalText, zText } from "@/lib/validation";

export const supplierSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "الكود يجب أن يكون أحرفاً إنجليزية وأرقام"),
  name: zText(120),
  contactName: zOptionalText(120),
  phone: zOptionalText(30),
  email: z.union([z.literal(""), z.string().email("بريد غير صالح")]).optional().transform((v) => v || null),
  taxId: zOptionalText(40),
  address: zOptionalText(300),
  paymentTerms: zOptionalText(120),
  notes: zOptionalText(1000),
  isActive: zCheckbox,
});

export async function saveSupplier(actor: Actor, id: string | null, input: unknown) {
  assertCan(actor, "suppliers.write");
  const data = supplierSchema.parse(input);
  return db.$transaction(async (tx) => {
    const dup = await tx.supplier.findFirst({ where: { code: data.code, ...(id ? { NOT: { id } } : {}) } });
    if (dup) throw conflict("كود المورد مستخدم بالفعل");
    if (id) {
      const before = await tx.supplier.findUnique({ where: { id } });
      if (!before) throw notFound("المورد");
      const after = await tx.supplier.update({ where: { id }, data });
      await audit(tx, actor, { action: "supplier.update", entityType: "supplier", entityId: id, before, after });
      return after;
    }
    const created = await tx.supplier.create({ data });
    await audit(tx, actor, { action: "supplier.create", entityType: "supplier", entityId: created.id, after: created });
    return created;
  });
}

export async function listSuppliers(actor: Actor, q?: string) {
  assertCan(actor, "suppliers.read");
  return db.supplier.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {},
    include: { _count: { select: { orders: true, products: true } } },
    orderBy: { name: "asc" },
  });
}
