import "server-only";
import { z } from "zod";
import { db, type DbOrTx } from "./db";

/**
 * Typed, database-backed business settings. Defaults live here; staff overrides live in `setting`.
 * Business values (tax, loyalty rates, return windows…) are read from here, never hardcoded in UI.
 */
export const settingSchemas = {
  store: z.object({
    name: z.string().default("شمس للبصريات"),
    nameEn: z.string().default("SHAMS Optics"),
    supportPhone: z.string().default("+20 100 000 0000"),
    supportEmail: z.string().default("care@shams.example"),
    whatsapp: z.string().optional(),
    instagram: z.string().optional(),
    facebook: z.string().optional(),
  }),
  tax: z.object({
    /** Egyptian VAT in basis points. */
    defaultRateBps: z.number().int().min(0).max(5000).default(1400),
    pricesIncludeTax: z.boolean().default(true),
  }),
  checkout: z.object({
    /** Branch that fulfils delivery orders when no branch preference applies. */
    onlineFulfillmentBranchId: z.string().nullable().default(null),
    pendingPaymentTtlMinutes: z.number().int().min(5).max(1440).default(60),
    codEnabled: z.boolean().default(true),
    codMaxTotal: z.number().int().min(0).default(2_000_000),
    payAtBranchEnabled: z.boolean().default(true),
    cardEnabled: z.boolean().default(true),
    walletEnabled: z.boolean().default(true),
    maxQuantityPerLine: z.number().int().min(1).max(20).default(5),
  }),
  loyalty: z.object({
    enabled: z.boolean().default(true),
    /** Points earned per 1 EGP of eligible spend (after discounts, excluding shipping). */
    pointsPerEgp: z.number().int().min(0).default(1),
    /** Value of one point in piasters when redeemed. */
    pointValuePiasters: z.number().int().min(0).default(5),
    minRedeemPoints: z.number().int().min(0).default(200),
    /** Max share of the order (after discounts) payable with points, in basis points. */
    maxRedeemBps: z.number().int().min(0).max(10_000).default(3000),
  }),
  returns: z.object({
    windowDays: z.number().int().min(0).default(14),
    allowPrescriptionLensReturns: z.boolean().default(false),
    allowCustomerRequests: z.boolean().default(true),
  }),
  analytics: z.object({
    enabled: z.boolean().default(true),
    requireConsent: z.boolean().default(true),
    abandonedCartMinutes: z.number().int().min(15).default(120),
  }),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type Settings<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>;

export async function getSetting<K extends SettingKey>(key: K, client: DbOrTx = db): Promise<Settings<K>> {
  const row = await client.setting.findUnique({ where: { key } });
  const schema = settingSchemas[key];
  const parsed = schema.safeParse(row?.value ?? {});
  return (parsed.success ? parsed.data : schema.parse({})) as Settings<K>;
}

export function parseSetting<K extends SettingKey>(key: K, value: unknown): Settings<K> {
  return settingSchemas[key].parse(value) as Settings<K>;
}
