import "server-only";
import { notFound } from "@/server/errors";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db";
import { audit } from "@/server/audit";
import { type Actor, assertCan } from "@/server/rbac/actor";
import { zCheckbox, zEgp, zOptionalEgp, zText } from "@/lib/validation";

export async function shippingOptionsFor(client: DbOrTx, governorate: string) {
  const zones = await client.shippingZone.findMany({
    where: { isActive: true, governorates: { has: governorate } },
    include: { rates: { where: { isActive: true }, orderBy: { price: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });
  return zones.flatMap((z) => z.rates.map((r) => ({ ...r, zoneName: z.name })));
}

export async function getShippingRate(client: DbOrTx, rateId: string, governorate: string) {
  const rate = await client.shippingRate.findFirst({
    where: { id: rateId, isActive: true, zone: { isActive: true, governorates: { has: governorate } } },
  });
  return rate;
}

export const rateSchema = z.object({
  name: zText(80),
  price: zEgp,
  freeOverTotal: zOptionalEgp,
  minDays: z.coerce.number().int().min(0).max(60),
  maxDays: z.coerce.number().int().min(0).max(60),
  codAllowed: zCheckbox,
  codFee: zOptionalEgp,
  isActive: zCheckbox,
});

export const zoneSchema = z.object({
  name: zText(80),
  governorates: z.array(z.string()).min(1, "اختر محافظة واحدة على الأقل"),
  isActive: zCheckbox,
});

export async function saveZone(actor: Actor, id: string | null, input: unknown) {
  assertCan(actor, "shipping.write");
  const data = zoneSchema.parse(input);
  const zone = id ? await db.shippingZone.update({ where: { id }, data }) : await db.shippingZone.create({ data });
  await audit(db, actor, { action: "shipping.update", entityType: "shipping_zone", entityId: zone.id, after: data });
  return zone;
}

export async function saveRate(actor: Actor, zoneId: string, id: string | null, input: unknown) {
  assertCan(actor, "shipping.write");
  const data = rateSchema.parse(input);
  const payload = { ...data, codFee: data.codFee ?? 0 };
  if (id) {
    const existing = await db.shippingRate.findFirst({ where: { id, zoneId } });
    if (!existing) throw notFound("سعر الشحن");
  }
  const rate = id ? await db.shippingRate.update({ where: { id }, data: payload }) : await db.shippingRate.create({ data: { ...payload, zoneId } });
  await audit(db, actor, { action: "shipping.update", entityType: "shipping_rate", entityId: rate.id, after: payload });
  return rate;
}
