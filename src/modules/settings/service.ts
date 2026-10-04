import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { type Actor, assertCan } from "@/server/rbac/actor";
import { type SettingKey, getSetting, parseSetting } from "@/server/settings";
import { parseEgp } from "@/lib/money";
import { invalid } from "@/server/errors";

const bool = (v: unknown) => v === "on" || v === "true" || v === true;
const int = (v: unknown, label: string) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw invalid(`${label}: رقم صحيح مطلوب`);
  return n;
};
const egp = (v: unknown, label: string) => {
  try { return parseEgp(String(v ?? "")); } catch { throw invalid(`${label}: قيمة مالية غير صالحة`); }
};
const pctToBps = (v: unknown, label: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw invalid(`${label}: نسبة بين 0 و100`);
  return Math.round(n * 100);
};

/** Convert a submitted settings form (human units) into the stored shape, then validate with the schema. */
function fromForm(key: SettingKey, f: Record<string, unknown>): unknown {
  switch (key) {
    case "store": return { name: f.name, nameEn: f.nameEn, supportPhone: f.supportPhone, supportEmail: f.supportEmail, whatsapp: f.whatsapp || undefined, instagram: f.instagram || undefined, facebook: f.facebook || undefined };
    case "tax": return { defaultRateBps: pctToBps(f.defaultRate, "نسبة الضريبة"), pricesIncludeTax: bool(f.pricesIncludeTax) };
    case "checkout": return {
      onlineFulfillmentBranchId: f.onlineFulfillmentBranchId || null,
      pendingPaymentTtlMinutes: int(f.pendingPaymentTtlMinutes, "مهلة الدفع"),
      codEnabled: bool(f.codEnabled), codMaxTotal: egp(f.codMaxTotal, "حد الدفع عند الاستلام"),
      payAtBranchEnabled: bool(f.payAtBranchEnabled), cardEnabled: bool(f.cardEnabled), walletEnabled: bool(f.walletEnabled),
      maxQuantityPerLine: int(f.maxQuantityPerLine, "الحد الأقصى للكمية"),
    };
    case "loyalty": return { enabled: bool(f.enabled), pointsPerEgp: int(f.pointsPerEgp, "النقاط لكل جنيه"), pointValuePiasters: egp(f.pointValue, "قيمة النقطة"), minRedeemPoints: int(f.minRedeemPoints, "الحد الأدنى للاستبدال"), maxRedeemBps: pctToBps(f.maxRedeemPct, "أقصى نسبة للدفع بالنقاط") };
    case "returns": return { windowDays: int(f.windowDays, "مدة الإرجاع"), allowPrescriptionLensReturns: bool(f.allowPrescriptionLensReturns), allowCustomerRequests: bool(f.allowCustomerRequests) };
    case "analytics": return { enabled: bool(f.enabled), requireConsent: bool(f.requireConsent), abandonedCartMinutes: int(f.abandonedCartMinutes, "مدة السلة المتروكة") };
  }
}

export const settingKeySchema = z.enum(["store", "tax", "checkout", "loyalty", "returns", "analytics"]);

export async function saveSettingsFromForm(actor: Actor, key: SettingKey, form: Record<string, unknown>) {
  assertCan(actor, "settings.write");
  const value = parseSetting(key, fromForm(key, form));
  if (key === "checkout") {
    const c = value as { onlineFulfillmentBranchId: string | null };
    if (c.onlineFulfillmentBranchId && !(await db.branch.findFirst({ where: { id: c.onlineFulfillmentBranchId, isActive: true } }))) throw invalid("فرع التنفيذ غير صالح");
  }
  const before = await getSetting(key);
  await db.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key }, update: { value: value as object }, create: { key, value: value as object } });
    await audit(tx, actor, { action: "settings.update", entityType: "setting", entityId: key, before, after: value });
  });
  return value;
}
