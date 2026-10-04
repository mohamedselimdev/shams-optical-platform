import { describe, expect, it } from "vitest";
import { priceOrder, type PricingLine, type PromotionRule, type PricingInput } from "./engine";

const line = (o: Partial<PricingLine> = {}): PricingLine => ({
  key: o.key ?? "l1",
  variantId: "v1",
  productId: o.productId ?? "p1",
  categoryId: o.categoryId ?? "cat",
  parentCategoryId: null,
  brandId: o.brandId ?? "b1",
  collectionIds: o.collectionIds ?? [],
  quantity: o.quantity ?? 1,
  unitPrice: o.unitPrice ?? 100_000,
  listPrice: o.listPrice ?? o.unitPrice ?? 100_000,
  lensUnitPrice: o.lensUnitPrice ?? 0,
  taxRateBps: 1400,
});

const promo = (o: Partial<PromotionRule>): PromotionRule => ({
  id: o.id ?? "promo",
  name: o.name ?? "promo",
  kind: o.kind ?? "AUTOMATIC",
  code: o.code ?? null,
  discountType: o.discountType ?? "PERCENTAGE",
  value: o.value ?? 1000,
  maxDiscount: o.maxDiscount ?? null,
  minSubtotal: o.minSubtotal ?? 0,
  scope: o.scope ?? "ORDER",
  targetIds: o.targetIds ?? [],
  excludeSaleItems: o.excludeSaleItems ?? false,
  includeLenses: o.includeLenses ?? true,
  stackable: o.stackable ?? false,
  priority: o.priority ?? 0,
});

const base = (o: Partial<PricingInput>): PricingInput => ({
  lines: [line()],
  promotions: [],
  couponCode: null,
  shipping: null,
  cashOnDelivery: false,
  loyalty: null,
  pricesIncludeTax: true,
  defaultTaxRateBps: 1400,
  ...o,
});

describe("pricing engine", () => {
  it("computes totals with inclusive VAT", () => {
    const r = priceOrder(base({ lines: [line({ unitPrice: 114_000 })] }));
    expect(r.subtotal).toBe(114_000);
    expect(r.taxTotal).toBe(14_000);
    expect(r.total).toBe(114_000);
  });

  it("adds lens price to the line and respects includeLenses=false", () => {
    const lines = [line({ unitPrice: 100_000, lensUnitPrice: 50_000 })];
    const r = priceOrder(base({ lines, promotions: [promo({ value: 1000, includeLenses: false })] }));
    expect(r.subtotal).toBe(150_000);
    expect(r.merchandiseDiscount).toBe(10_000);
  });

  it("caps percentage discounts by maxDiscount", () => {
    const r = priceOrder(base({ promotions: [promo({ value: 5000, maxDiscount: 20_000 })] }));
    expect(r.merchandiseDiscount).toBe(20_000);
  });

  it("never discounts more than the eligible amount", () => {
    const r = priceOrder(base({ promotions: [promo({ discountType: "FIXED_AMOUNT", value: 999_999 })] }));
    expect(r.merchandiseDiscount).toBe(100_000);
    expect(r.total).toBe(0);
  });

  it("applies the coupon only when the code matches (case-insensitive)", () => {
    const coupon = promo({ id: "c", kind: "COUPON", code: "SAVE10", value: 1000 });
    expect(priceOrder(base({ promotions: [coupon], couponCode: null })).merchandiseDiscount).toBe(0);
    const r = priceOrder(base({ promotions: [coupon], couponCode: "save10" }));
    expect(r.couponStatus).toBe("applied");
    expect(r.merchandiseDiscount).toBe(10_000);
    expect(priceOrder(base({ promotions: [coupon], couponCode: "NOPE" })).couponStatus).toBe("not_found");
  });

  it("prevents stacking non-stackable promotions and picks the best", () => {
    const auto = promo({ id: "a", value: 2000 });
    const coupon = promo({ id: "c", kind: "COUPON", code: "X", value: 1000 });
    const r = priceOrder(base({ promotions: [auto, coupon], couponCode: "X" }));
    expect(r.merchandiseDiscount).toBe(20_000);
    expect(r.applied.map((a) => a.id)).toEqual(["a"]);
    expect(r.couponStatus).toBe("not_combinable");
  });

  it("stacks stackable promotions sequentially on the remaining amount", () => {
    const a = promo({ id: "a", value: 1000, stackable: true, priority: 2 });
    const b = promo({ id: "b", value: 1000, stackable: true, priority: 1 });
    const r = priceOrder(base({ promotions: [a, b] }));
    expect(r.merchandiseDiscount).toBe(10_000 + 9_000);
  });

  it("scopes promotions to categories/brands/collections and excludes sale items", () => {
    const lines = [line({ key: "x", categoryId: "rx", unitPrice: 100_000 }), line({ key: "y", categoryId: "sun", unitPrice: 50_000, listPrice: 80_000 })];
    const cat = priceOrder(base({ lines, promotions: [promo({ scope: "CATEGORIES", targetIds: ["rx"], value: 1000 })] }));
    expect(cat.merchandiseDiscount).toBe(10_000);
    const all = priceOrder(base({ lines, promotions: [promo({ excludeSaleItems: true, value: 1000 })] }));
    expect(all.merchandiseDiscount).toBe(10_000);
  });

  it("enforces minimum subtotal", () => {
    const coupon = promo({ kind: "COUPON", code: "BIG", minSubtotal: 500_000 });
    const r = priceOrder(base({ promotions: [coupon], couponCode: "BIG" }));
    expect(r.couponStatus).toBe("min_subtotal");
    expect(r.merchandiseDiscount).toBe(0);
  });

  it("handles free shipping thresholds, shipping promos and COD fees", () => {
    const shipping = { cost: 6_000, freeOverTotal: 250_000, codFee: 1_500 };
    const r1 = priceOrder(base({ shipping, cashOnDelivery: true }));
    expect(r1.total).toBe(100_000 + 6_000 + 1_500);
    const r2 = priceOrder(base({ shipping, lines: [line({ unitPrice: 300_000 })] }));
    expect(r2.shippingTotal).toBe(0);
    const r3 = priceOrder(base({ shipping, promotions: [promo({ discountType: "FREE_SHIPPING" })] }));
    expect(r3.shippingDiscount).toBe(6_000);
    expect(r3.total).toBe(100_000);
  });

  it("caps loyalty redemption by balance, minimum and max share", () => {
    const loyalty = { requestedPoints: 100_000, balance: 5_000, pointValuePiasters: 5, minRedeemPoints: 200, maxRedeemBps: 3000 };
    const r = priceOrder(base({ loyalty }));
    // 30% of 1000 EGP = 300 EGP = 30,000 piasters → 6,000 points, but balance is 5,000.
    expect(r.loyaltyPointsRedeemed).toBe(5_000);
    expect(r.loyaltyDiscount).toBe(25_000);
    const tooFew = priceOrder(base({ loyalty: { ...loyalty, requestedPoints: 100, balance: 100 } }));
    expect(tooFew.loyaltyDiscount).toBe(0);
  });

  it("line totals always sum to the order total (inclusive tax)", () => {
    const lines = [line({ key: "a", unitPrice: 33_333, quantity: 3 }), line({ key: "b", unitPrice: 77_777 })];
    const r = priceOrder(base({ lines, promotions: [promo({ value: 1234 })], loyalty: { requestedPoints: 1000, balance: 1000, pointValuePiasters: 5, minRedeemPoints: 0, maxRedeemBps: 10_000 } }));
    expect(r.lines.reduce((s, l) => s + l.lineTotal, 0)).toBe(r.total);
  });
});
