import "server-only";
import type { DbOrTx } from "@/server/db";
import { getSetting } from "@/server/settings";
import { DomainError } from "@/server/errors";
import { effectivePrice } from "../catalog/service";
import type { CartWithItems } from "../cart/service";
import { validateLensLine } from "../cart/service";
import { eligiblePromotions } from "../promotions/service";
import { getShippingRate } from "../shipping/service";
import { type PricingLine, type PricingResult, priceOrder } from "../pricing/engine";
import type { LensSnapshot } from "../lenses/pricing";
import type { FulfillmentType, PaymentMethod } from "@/generated/prisma/enums";

export type QuoteOptions = {
  customerId: string | null;
  couponCode: string | null;
  fulfillmentType: FulfillmentType;
  governorate?: string | null;
  shippingRateId?: string | null;
  paymentMethod?: PaymentMethod | null;
  loyaltyPoints?: number;
};

export type QuoteLine = {
  item: CartWithItems["items"][number];
  lens: LensSnapshot | null;
  prescription: { id: string; status: string; label: string; values: Record<string, unknown> } | null;
  pricing: PricingLine;
  available: number;
  problem: string | null;
};

export type Quote = {
  lines: QuoteLine[];
  pricing: PricingResult;
  shippingRate: { id: string; name: string; price: number; freeOverTotal: number | null; codAllowed: boolean; codFee: number; minDays: number; maxDays: number } | null;
  issues: string[];
  requiresPrescription: boolean;
};

const RX_FIELDS = ["odSph", "odCyl", "odAxis", "odAdd", "odPrism", "odBase", "osSph", "osCyl", "osAxis", "osAdd", "osPrism", "osBase", "pdType", "pd", "pdRight", "pdLeft"] as const;

/**
 * Price a cart from database truth (variants, lens tables, promotions, shipping, loyalty, tax).
 * Used for display and, inside the order transaction, as the authoritative computation.
 */
export async function buildQuote(client: DbOrTx, cart: CartWithItems, opts: QuoteOptions): Promise<Quote> {
  // Sequential on purpose: `client` may be an interactive transaction (single connection).
  const tax = await getSetting("tax", client);
  const loyaltySettings = await getSetting("loyalty", client);
  const issues: string[] = [];
  const lines: QuoteLine[] = [];

  for (const item of cart.items) {
    const v = item.variant;
    const p = v.product;
    let problem: string | null = null;
    let lens: LensSnapshot | null = null;
    let prescription: QuoteLine["prescription"] = null;
    if (!v.isActive || p.status !== "ACTIVE") problem = "المنتج لم يعد متاحاً";
    if (!problem) {
      try {
        const r = await validateLensLine(client, { product: p, ...item }, opts.customerId);
        lens = r.lens;
        if (r.prescription) {
          const rx = r.prescription as unknown as Record<string, unknown> & { id: string; status: string; label: string };
          prescription = { id: rx.id, status: rx.status, label: rx.label, values: Object.fromEntries(RX_FIELDS.map((k) => [k, rx[k] ?? null])) };
        }
      } catch (e) {
        problem = e instanceof DomainError ? e.message : "إعداد العدسات غير صالح";
      }
    }
    const available = v.inventory.reduce((s, i) => s + Math.max(0, i.onHand - i.reserved), 0);
    if (!problem && available < item.quantity) problem = available === 0 ? "نفد من المخزون" : `المتاح ${available} فقط`;
    if (problem) issues.push(`${p.name}: ${problem}`);

    lines.push({
      item,
      lens,
      prescription,
      available,
      problem,
      pricing: {
        key: item.id,
        variantId: v.id,
        productId: p.id,
        categoryId: p.category?.id ?? null,
        parentCategoryId: p.category?.parentId ?? null,
        brandId: p.brand?.id ?? null,
        collectionIds: p.collections.map((c) => c.collectionId),
        quantity: item.quantity,
        unitPrice: effectivePrice(v),
        listPrice: v.price,
        lensUnitPrice: lens?.unitPrice ?? 0,
        taxRateBps: p.taxRateBps ?? tax.defaultRateBps,
      },
    });
  }

  let shippingRate: Quote["shippingRate"] = null;
  if (opts.fulfillmentType === "DELIVERY" && opts.governorate && opts.shippingRateId) {
    const r = await getShippingRate(client, opts.shippingRateId, opts.governorate);
    if (r) shippingRate = { id: r.id, name: r.name, price: r.price, freeOverTotal: r.freeOverTotal, codAllowed: r.codAllowed, codFee: r.codFee, minDays: r.minDays, maxDays: r.maxDays };
    else issues.push("طريقة الشحن غير متاحة لهذه المحافظة");
  }

  const promotions = await eligiblePromotions(client, { customerId: opts.customerId, couponCode: opts.couponCode });
  let loyalty = null;
  if (opts.customerId && loyaltySettings.enabled && (opts.loyaltyPoints ?? 0) > 0) {
    const acc = await client.loyaltyAccount.findUnique({ where: { customerId: opts.customerId } });
    loyalty = {
      requestedPoints: opts.loyaltyPoints ?? 0,
      balance: acc?.balance ?? 0,
      pointValuePiasters: loyaltySettings.pointValuePiasters,
      minRedeemPoints: loyaltySettings.minRedeemPoints,
      maxRedeemBps: loyaltySettings.maxRedeemBps,
    };
  }

  const pricing = priceOrder({
    lines: lines.filter((l) => !l.problem).map((l) => l.pricing),
    promotions,
    couponCode: opts.couponCode,
    shipping: shippingRate ? { cost: shippingRate.price, freeOverTotal: shippingRate.freeOverTotal, codFee: shippingRate.codFee } : null,
    cashOnDelivery: opts.paymentMethod === "COD",
    loyalty,
    pricesIncludeTax: tax.pricesIncludeTax,
    defaultTaxRateBps: tax.defaultRateBps,
  });

  return { lines, pricing, shippingRate, issues, requiresPrescription: lines.some((l) => l.prescription !== null) };
}
