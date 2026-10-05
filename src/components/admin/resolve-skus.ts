import "server-only";
import { db } from "@/server/db";
import { invalid } from "@/server/errors";
import { getT } from "@/i18n/server";

type Line = { sku?: unknown; quantity?: unknown; unitCost?: unknown };

/** Map submitted SKU/barcode lines to variant ids; unknown codes are reported by name. */
export async function resolveSkuLines(lines: unknown): Promise<{ variantId: string; quantity: string; unitCost?: string }[]> {
  const t = await getT();
  const list = (Array.isArray(lines) ? lines : []) as Line[];
  const clean = list.map((l) => ({ code: String(l.sku ?? "").trim().toUpperCase(), quantity: String(l.quantity ?? ""), unitCost: l.unitCost === undefined ? undefined : String(l.unitCost) })).filter((l) => l.code);
  if (!clean.length) throw invalid(t("أضف بنداً واحداً على الأقل"));
  const codes = [...new Set(clean.map((l) => l.code))];
  const variants = await db.productVariant.findMany({ where: { OR: [{ sku: { in: codes } }, { barcode: { in: codes } }] }, select: { id: true, sku: true, barcode: true } });
  const byCode = new Map<string, string>();
  for (const v of variants) {
    byCode.set(v.sku, v.id);
    if (v.barcode) byCode.set(v.barcode.toUpperCase(), v.id);
  }
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length) throw invalid(t("رموز غير معروفة: {0}", [missing.join(t("، "))]));
  return clean.map((l) => ({ variantId: byCode.get(l.code)!, quantity: l.quantity, ...(l.unitCost !== undefined ? { unitCost: l.unitCost } : {}) }));
}
