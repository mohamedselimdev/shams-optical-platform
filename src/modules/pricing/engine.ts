/**
 * Pure pricing engine — the single place where order money is computed.
 * Used for cart display, checkout preview and the authoritative order creation,
 * always with server-loaded inputs. No I/O here so it is exhaustively unit-testable.
 */
import { allocate, applyBps, exclusiveTax, inclusiveTax } from "@/lib/money";

export type PricingLine = {
  key: string;
  variantId: string;
  productId: string;
  categoryId: string | null;
  /** Parent category id, so category promotions on a parent apply to children. */
  parentCategoryId: string | null;
  brandId: string | null;
  collectionIds: string[];
  quantity: number;
  /** Effective frame unit price (sale applied). */
  unitPrice: number;
  /** Original list price before sale. */
  listPrice: number;
  lensUnitPrice: number;
  taxRateBps: number;
};

export type PromotionRule = {
  id: string;
  name: string;
  kind: "COUPON" | "AUTOMATIC";
  code: string | null;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";
  value: number;
  maxDiscount: number | null;
  minSubtotal: number;
  scope: "ORDER" | "PRODUCTS" | "CATEGORIES" | "BRANDS" | "COLLECTIONS";
  targetIds: string[];
  excludeSaleItems: boolean;
  includeLenses: boolean;
  stackable: boolean;
  priority: number;
};

export type ShippingQuote = { cost: number; freeOverTotal: number | null; codFee: number } | null;

export type LoyaltyInput = {
  requestedPoints: number;
  balance: number;
  pointValuePiasters: number;
  minRedeemPoints: number;
  maxRedeemBps: number;
} | null;

export type PricingInput = {
  lines: PricingLine[];
  /** Promotions already filtered for date/usage/customer eligibility. */
  promotions: PromotionRule[];
  couponCode: string | null;
  shipping: ShippingQuote;
  cashOnDelivery: boolean;
  loyalty: LoyaltyInput;
  pricesIncludeTax: boolean;
  defaultTaxRateBps: number;
};

export type PricedLine = PricingLine & {
  lineSubtotal: number;
  discount: number;
  loyaltyDiscount: number;
  net: number;
  tax: number;
  lineTotal: number;
};

export type AppliedPromotion = { id: string; name: string; code: string | null; amount: number; freeShipping: boolean };

export type PricingResult = {
  lines: PricedLine[];
  subtotal: number;
  merchandiseDiscount: number;
  shippingDiscount: number;
  discountTotal: number;
  loyaltyDiscount: number;
  loyaltyPointsRedeemed: number;
  shippingTotal: number;
  codFee: number;
  taxTotal: number;
  total: number;
  applied: AppliedPromotion[];
  couponStatus: "none" | "applied" | "not_found" | "not_eligible" | "min_subtotal" | "not_combinable";
  loyaltyMessage: string | null;
};

const lineBase = (l: PricingLine, includeLenses: boolean, sale = true) =>
  ((sale ? l.unitPrice : l.listPrice) + (includeLenses ? l.lensUnitPrice : 0)) * l.quantity;

function lineMatches(p: PromotionRule, l: PricingLine): boolean {
  if (p.excludeSaleItems && l.unitPrice < l.listPrice) return false;
  switch (p.scope) {
    case "ORDER":
      return true;
    case "PRODUCTS":
      return p.targetIds.includes(l.productId);
    case "CATEGORIES":
      return (l.categoryId !== null && p.targetIds.includes(l.categoryId)) || (l.parentCategoryId !== null && p.targetIds.includes(l.parentCategoryId));
    case "BRANDS":
      return l.brandId !== null && p.targetIds.includes(l.brandId);
    case "COLLECTIONS":
      return l.collectionIds.some((c) => p.targetIds.includes(c));
  }
}

type Evaluated = { promo: PromotionRule; perLine: Map<string, number>; shipping: number; total: number };

/** Evaluate one promotion against remaining per-line amounts. */
function evaluate(p: PromotionRule, lines: PricingLine[], remaining: Map<string, number>, shippingCost: number, merchandise: number): Evaluated | null {
  if (merchandise < p.minSubtotal) return null;
  if (p.discountType === "FREE_SHIPPING") {
    return shippingCost > 0 ? { promo: p, perLine: new Map(), shipping: shippingCost, total: shippingCost } : null;
  }
  const eligible = lines.filter((l) => lineMatches(p, l));
  if (!eligible.length) return null;
  // Lens part may be excluded from the discount base; cap by the line's remaining amount.
  const bases = eligible.map((l) => Math.min(lineBase(l, p.includeLenses), remaining.get(l.key) ?? 0));
  const baseTotal = bases.reduce((a, b) => a + b, 0);
  if (baseTotal <= 0) return null;
  let amount = p.discountType === "PERCENTAGE" ? applyBps(baseTotal, p.value) : Math.min(p.value, baseTotal);
  if (p.maxDiscount !== null) amount = Math.min(amount, p.maxDiscount);
  amount = Math.min(amount, baseTotal);
  if (amount <= 0) return null;
  const parts = allocate(amount, bases);
  return { promo: p, perLine: new Map(eligible.map((l, i) => [l.key, parts[i]])), shipping: 0, total: amount };
}

/** Apply a set of promotions sequentially (highest priority first) on remaining amounts. */
function applySet(set: PromotionRule[], lines: PricingLine[], shippingCost: number, merchandise: number) {
  const remaining = new Map(lines.map((l) => [l.key, lineBase(l, true)]));
  let shippingLeft = shippingCost;
  const results: Evaluated[] = [];
  for (const p of [...set].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    const r = evaluate(p, lines, remaining, shippingLeft, merchandise);
    if (!r) continue;
    for (const [k, v] of r.perLine) remaining.set(k, (remaining.get(k) ?? 0) - v);
    shippingLeft -= r.shipping;
    results.push(r);
  }
  return { results, total: results.reduce((s, r) => s + r.total, 0) };
}

export function priceOrder(input: PricingInput): PricingResult {
  const lines = input.lines;
  const subtotal = lines.reduce((s, l) => s + lineBase(l, true), 0);
  const shippingBase = input.shipping ? (input.shipping.freeOverTotal !== null && subtotal >= input.shipping.freeOverTotal ? 0 : input.shipping.cost) : 0;

  // Coupon resolution.
  const code = input.couponCode?.trim().toUpperCase() || null;
  const coupon = code ? input.promotions.find((p) => p.kind === "COUPON" && p.code?.toUpperCase() === code) ?? null : null;
  let couponStatus: PricingResult["couponStatus"] = code ? (coupon ? "applied" : "not_found") : "none";
  const candidates = input.promotions.filter((p) => p.kind === "AUTOMATIC" || p === coupon);

  // Stacking: either every stackable promotion together, or one non-stackable promotion alone.
  const options: PromotionRule[][] = [];
  const stackable = candidates.filter((p) => p.stackable);
  if (stackable.length) options.push(stackable);
  for (const p of candidates.filter((c) => !c.stackable)) options.push([p]);
  let best = { results: [] as Evaluated[], total: 0 };
  for (const set of options) {
    const r = applySet(set, lines, shippingBase, subtotal);
    const includesCoupon = r.results.some((x) => x.promo === coupon);
    const bestIncludesCoupon = best.results.some((x) => x.promo === coupon);
    if (r.total > best.total || (r.total === best.total && includesCoupon && !bestIncludesCoupon)) best = r;
  }
  if (coupon && !best.results.some((r) => r.promo === coupon)) {
    const alone = applySet([coupon], lines, shippingBase, subtotal);
    couponStatus = alone.total === 0 ? (subtotal < coupon.minSubtotal ? "min_subtotal" : "not_eligible") : "not_combinable";
  }

  const lineDiscount = new Map<string, number>();
  let shippingDiscount = 0;
  for (const r of best.results) {
    for (const [k, v] of r.perLine) lineDiscount.set(k, (lineDiscount.get(k) ?? 0) + v);
    shippingDiscount += r.shipping;
  }
  const merchandiseDiscount = [...lineDiscount.values()].reduce((a, b) => a + b, 0);
  const afterDiscount = subtotal - merchandiseDiscount;

  // Loyalty redemption, capped by balance, minimum, and maximum share of the order.
  let loyaltyDiscount = 0;
  let loyaltyPointsRedeemed = 0;
  let loyaltyMessage: string | null = null;
  if (input.loyalty && input.loyalty.requestedPoints > 0 && input.loyalty.pointValuePiasters > 0) {
    const l = input.loyalty;
    const points = Math.min(l.requestedPoints, l.balance);
    if (points < l.minRedeemPoints) {
      loyaltyMessage = `الحد الأدنى للاستبدال ${l.minRedeemPoints} نقطة`;
    } else {
      const cap = applyBps(afterDiscount, l.maxRedeemBps);
      const usable = Math.min(points, Math.floor(cap / l.pointValuePiasters));
      if (usable > 0) {
        loyaltyPointsRedeemed = usable;
        loyaltyDiscount = usable * l.pointValuePiasters;
        if (usable < points) loyaltyMessage = "تم تطبيق الحد الأقصى المسموح من النقاط لهذا الطلب";
      }
    }
  }
  const loyaltyParts = allocate(loyaltyDiscount, lines.map((l) => lineBase(l, true) - (lineDiscount.get(l.key) ?? 0)));

  const pricedLines: PricedLine[] = lines.map((l, i) => {
    const lineSubtotal = lineBase(l, true);
    const discount = lineDiscount.get(l.key) ?? 0;
    const loyaltyPart = loyaltyParts[i] ?? 0;
    const net = lineSubtotal - discount - loyaltyPart;
    const tax = input.pricesIncludeTax ? inclusiveTax(net, l.taxRateBps) : exclusiveTax(net, l.taxRateBps);
    return { ...l, lineSubtotal, discount, loyaltyDiscount: loyaltyPart, net, tax, lineTotal: input.pricesIncludeTax ? net : net + tax };
  });

  const shippingTotal = shippingBase;
  const codFee = input.cashOnDelivery && input.shipping ? input.shipping.codFee : 0;
  const shippingNet = shippingTotal - shippingDiscount + codFee;
  const shippingTax = input.pricesIncludeTax ? inclusiveTax(shippingNet, input.defaultTaxRateBps) : exclusiveTax(shippingNet, input.defaultTaxRateBps);
  const linesTax = pricedLines.reduce((s, l) => s + l.tax, 0);
  const taxTotal = linesTax + shippingTax;
  const total = afterDiscount - loyaltyDiscount + shippingNet + (input.pricesIncludeTax ? 0 : taxTotal);

  return {
    lines: pricedLines,
    subtotal,
    merchandiseDiscount,
    shippingDiscount,
    discountTotal: merchandiseDiscount + shippingDiscount,
    loyaltyDiscount,
    loyaltyPointsRedeemed,
    shippingTotal,
    codFee,
    taxTotal,
    total,
    applied: best.results.map((r) => ({ id: r.promo.id, name: r.promo.name, code: r.promo.code, amount: r.total, freeShipping: r.shipping > 0 })),
    couponStatus,
    loyaltyMessage,
  };
}

/** Points earned for an amount paid (piasters), floor-rounded. */
export function pointsForAmount(amountPiasters: number, pointsPerEgp: number) {
  return Math.max(0, Math.floor((amountPiasters * pointsPerEgp) / 100));
}
