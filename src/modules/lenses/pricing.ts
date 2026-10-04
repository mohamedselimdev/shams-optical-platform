import "server-only";
import type { DbOrTx } from "@/server/db";
import { invalid } from "@/server/errors";
import { type PrescriptionValues, hasAdd, powerEnvelope } from "../prescriptions/schema";

export type LensSelection = {
  lensTypeId: string;
  lensIndexId: string;
  optionIds: string[];
};

export type LensSnapshot = {
  type: { id: string; key: string; name: string; requiresPrescription: boolean };
  index: { id: string; key: string; name: string; value: number };
  packagePrice: number;
  options: { id: string; key: string; name: string; group: string; price: number }[];
  unitPrice: number;
};

/**
 * Authoritative lens price & validation. The client may preview prices but the order always uses this.
 * `prescription` is the effective values when known (entered/saved); uploaded prescriptions are verified by staff later.
 */
export async function priceLensSelection(
  client: DbOrTx,
  selection: LensSelection,
  prescription: PrescriptionValues | null,
): Promise<LensSnapshot> {
  // Sequential on purpose: `client` may be an interactive transaction (single connection).
  const type = await client.lensType.findUnique({ where: { id: selection.lensTypeId } });
  const index = await client.lensIndex.findUnique({ where: { id: selection.lensIndexId } });
  const pkg = await client.lensPackagePrice.findUnique({
    where: { lensTypeId_lensIndexId: { lensTypeId: selection.lensTypeId, lensIndexId: selection.lensIndexId } },
  });
  const options = selection.optionIds.length
    ? await client.lensOption.findMany({ where: { id: { in: selection.optionIds } }, include: { rules: true } })
    : [];
  if (!type?.isActive) throw invalid("نوع العدسة غير متاح");
  if (!index?.isActive) throw invalid("معامل انكسار العدسة غير متاح");
  if (!pkg?.isActive) throw invalid("هذا المزيج من العدسات غير متاح");
  const uniqueIds = new Set(selection.optionIds);
  if (options.length !== uniqueIds.size) throw invalid("إضافة عدسة غير موجودة");

  const groups = new Map<string, number>();
  for (const opt of options) {
    if (!opt.isActive) throw invalid(`الإضافة غير متاحة: ${opt.name}`);
    if (opt.rules.length && !opt.rules.some((r) => r.lensTypeId === type.id)) throw invalid(`الإضافة ${opt.name} غير متوافقة مع ${type.name}`);
    if (opt.exclusive) {
      groups.set(opt.group, (groups.get(opt.group) ?? 0) + 1);
      if ((groups.get(opt.group) ?? 0) > 1) throw invalid("لا يمكن اختيار أكثر من إضافة من نفس المجموعة");
    }
  }

  if (prescription) {
    if (type.requiresAdd && !hasAdd(prescription)) throw invalid("العدسات متعددة البؤر تتطلب قيمة ADD في الوصفة");
    const env = powerEnvelope(prescription);
    if (env.minSph < index.minSph || env.maxSph > index.maxSph || env.maxCyl > index.maxCyl) {
      throw invalid(`قوة الوصفة غير مناسبة لعدسة ${index.name}؛ اختر معامل انكسار أعلى`);
    }
  }

  const optionTotal = options.reduce((s, o) => s + o.price, 0);
  return {
    type: { id: type.id, key: type.key, name: type.name, requiresPrescription: type.requiresPrescription },
    index: { id: index.id, key: index.key, name: index.name, value: index.value },
    packagePrice: pkg.price,
    options: options.map((o) => ({ id: o.id, key: o.key, name: o.name, group: o.group, price: o.price })),
    unitPrice: pkg.price + optionTotal,
  };
}

/** Catalog of active lens choices for the configurator UI. */
export async function lensCatalog(client: DbOrTx) {
  const [types, indexes, prices, options] = await Promise.all([
    client.lensType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    client.lensIndex.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    client.lensPackagePrice.findMany({ where: { isActive: true } }),
    client.lensOption.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { rules: true } }),
  ]);
  return {
    types,
    indexes,
    prices: prices.map((p) => ({ lensTypeId: p.lensTypeId, lensIndexId: p.lensIndexId, price: p.price })),
    options: options.map((o) => ({ ...o, lensTypeIds: o.rules.map((r) => r.lensTypeId) })),
  };
}
