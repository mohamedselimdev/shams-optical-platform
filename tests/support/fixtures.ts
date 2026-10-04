import { db } from "@/server/db";
import { applyMovement } from "@/modules/inventory/ledger";
import type { StaffActor, CustomerActor } from "@/server/rbac/actor";
import { ALL_PERMISSIONS, SYSTEM_ROLES, type Permission } from "@/server/rbac/permissions";

/** Wipe all tables between test files (TRUNCATE bypasses the append-only row triggers). */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export function staffActor(roleKey: string, opts: { branchIds?: "ALL" | string[]; userId?: string; extra?: Permission[] } = {}): StaffActor {
  const role = SYSTEM_ROLES.find((r) => r.key === roleKey)!;
  const perms = role.permissions === "*" ? ALL_PERMISSIONS : role.permissions;
  return {
    kind: "staff",
    userId: opts.userId ?? `user_${uid()}`,
    staffId: `staff_${uid()}`,
    name: roleKey,
    email: `${roleKey}@test`,
    roleKeys: [roleKey],
    permissions: new Set([...perms, ...(opts.extra ?? [])]),
    branchIds: opts.branchIds ?? "ALL",
    defaultBranchId: null,
  };
}

export async function makeBranch(overrides: Partial<{ code: string; shipsOnline: boolean; pickupEnabled: boolean; type: "STORE" | "WAREHOUSE" }> = {}) {
  const code = overrides.code ?? `B${uid()}`.slice(0, 10).toUpperCase();
  return db.branch.create({
    data: { code, slug: code.toLowerCase(), name: `فرع ${code}`, governorate: "القاهرة", city: "القاهرة", addressLine: "عنوان", type: overrides.type ?? "STORE", shipsOnline: overrides.shipsOnline ?? true, pickupEnabled: overrides.pickupEnabled ?? true },
  });
}

export async function makeProduct(opts: { price?: number; salePrice?: number | null; cost?: number; rx?: boolean; categoryId?: string } = {}) {
  const id = uid();
  return db.product.create({
    data: {
      slug: `p-${id}`,
      name: `منتج ${id}`,
      type: "FRAME",
      status: "ACTIVE",
      prescriptionCompatible: opts.rx ?? true,
      categoryId: opts.categoryId ?? null,
      minPrice: opts.salePrice ?? opts.price ?? 100_000,
      variants: { create: [{ sku: `SKU-${id}`.toUpperCase(), price: opts.price ?? 100_000, salePrice: opts.salePrice ?? null, costPrice: opts.cost ?? 40_000, colorName: "أسود" }] },
    },
    include: { variants: true },
  });
}

export async function stock(branchId: string, variantId: string, quantity: number) {
  await db.$transaction((tx) => applyMovement(tx, { branchId, variantId, type: "OPENING_BALANCE", quantity, reason: "test" }));
}

export async function makeCustomer(): Promise<CustomerActor> {
  const userId = crypto.randomUUID();
  const email = `c${uid()}@test.example`;
  await db.user.create({ data: { id: userId, name: "عميل اختبار", email, emailVerified: true } });
  const customer = await db.customer.create({ data: { userId, firstName: "عميل", email, phone: "01012345678" } });
  return { kind: "customer", userId, customerId: customer.id, name: "عميل اختبار", email };
}

export async function makeCart(items: { variantId: string; quantity: number; lensTypeId?: string; lensIndexId?: string; lensOptionIds?: string[]; prescriptionId?: string; prescriptionMode?: "SAVED" | "NONE" }[], customerId: string | null = null) {
  return db.cart.create({
    data: {
      token: `tok_${uid()}`,
      customerId,
      items: {
        create: items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          lensTypeId: i.lensTypeId ?? null,
          lensIndexId: i.lensIndexId ?? null,
          lensOptionIds: i.lensOptionIds ?? [],
          prescriptionId: i.prescriptionId ?? null,
          prescriptionMode: i.prescriptionMode ?? "NONE",
        })),
      },
    },
  });
}

export async function makeShipping() {
  const zone = await db.shippingZone.create({ data: { name: "القاهرة", governorates: ["القاهرة", "الجيزة"] } });
  return db.shippingRate.create({ data: { zoneId: zone.id, name: "عادي", price: 6_000, freeOverTotal: 250_000, codFee: 1_500 } });
}

export const address = {
  fullName: "أحمد علي",
  phone: "01012345678",
  governorate: "القاهرة",
  city: "مدينة نصر",
  street: "شارع عباس العقاد",
};

export function key() {
  return `idem_${uid()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function onHand(branchId: string, variantId: string) {
  const row = await db.inventoryItem.findUnique({ where: { branchId_variantId: { branchId, variantId } } });
  return { onHand: row?.onHand ?? 0, reserved: row?.reserved ?? 0 };
}

/** Ledger invariant: replaying movements reproduces the projection exactly. */
export async function assertLedgerConsistent() {
  const rows = await db.$queryRaw<{ branchId: string; variantId: string; onHand: number; reserved: number; mOnHand: bigint; mReserved: bigint }[]>`
    SELECT i."branchId", i."variantId", i."onHand", i."reserved",
           COALESCE(SUM(m."quantity"),0) AS "mOnHand", COALESCE(SUM(m."reservedDelta"),0) AS "mReserved"
      FROM "inventory_item" i LEFT JOIN "inventory_movement" m ON m."branchId" = i."branchId" AND m."variantId" = i."variantId"
     GROUP BY i."branchId", i."variantId", i."onHand", i."reserved"`;
  for (const r of rows) {
    if (Number(r.mOnHand) !== r.onHand || Number(r.mReserved) !== r.reserved) {
      throw new Error(`Ledger mismatch for ${r.branchId}/${r.variantId}: projection ${r.onHand}/${r.reserved} vs ledger ${r.mOnHand}/${r.mReserved}`);
    }
  }
}
