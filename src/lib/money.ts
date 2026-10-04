/**
 * Centralised money helpers. All amounts are integer piasters (1 EGP = 100 piasters).
 * Never use floating point for stored or compared money values.
 */

export type Piasters = number;

export const CURRENCY = "EGP" as const;

export function assertMoney(value: number, label = "amount"): Piasters {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of piasters, got ${value}`);
  }
  return value;
}

/** Convert a user-entered EGP decimal string ("149.50") into piasters without float math. */
export function parseEgp(input: string | number): Piasters {
  const raw = typeof input === "number" ? input.toFixed(2) : input.trim().replace(/[,\s٬]/g, "");
  const normalized = toAsciiDigits(raw).replace("٫", ".");
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new RangeError(`Invalid EGP amount: ${input}`);
  const [, sign, whole, frac = ""] = match;
  const value = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return assertMoney(sign ? -value : value);
}

export function toEgpString(amount: Piasters): string {
  assertMoney(amount);
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Integer division rounding half away from zero. */
export function divRound(numerator: number, denominator: number): number {
  if (denominator === 0) throw new RangeError("Division by zero");
  const sign = Math.sign(numerator) * Math.sign(denominator);
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  return sign * Math.floor((2 * n + d) / (2 * d));
}

/** Apply basis points (1 bp = 0.01%) to an amount, rounding half away from zero. */
export function applyBps(amount: Piasters, bps: number): Piasters {
  return divRound(assertMoney(amount) * bps, 10_000);
}

/** Tax contained in a tax-inclusive amount: amount × rate / (1 + rate). */
export function inclusiveTax(amount: Piasters, rateBps: number): Piasters {
  if (rateBps <= 0) return 0;
  return divRound(assertMoney(amount) * rateBps, 10_000 + rateBps);
}

/** Tax added on top of a tax-exclusive amount. */
export function exclusiveTax(amount: Piasters, rateBps: number): Piasters {
  if (rateBps <= 0) return 0;
  return applyBps(amount, rateBps);
}

export function sumMoney(values: Iterable<Piasters>): Piasters {
  let total = 0;
  for (const v of values) total += assertMoney(v);
  return assertMoney(total);
}

/**
 * Split `total` across `weights` proportionally so the parts sum exactly to `total`
 * (largest-remainder method). Used to allocate order-level discounts to lines.
 */
export function allocate(total: Piasters, weights: number[]): Piasters[] {
  assertMoney(total);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (weightSum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((w) => (total * w) / weightSum);
  const floored = raw.map((r) => Math.floor(r));
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] += 1;
    remainder -= 1;
  }
  return floored;
}

const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
export function toAsciiDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)));
}

const formatters = new Map<string, Intl.NumberFormat>();
function formatter(locale: string, fractionDigits: number) {
  const key = `${locale}:${fractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: CURRENCY,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, f);
  }
  return f;
}

/** Format piasters for display, e.g. "١٬٢٥٠٫٠٠ ج.م.‏". Display only — never parse this back. */
export function formatMoney(amount: Piasters, locale = "ar-EG"): string {
  const fractionDigits = amount % 100 === 0 ? 0 : 2;
  return formatter(locale, fractionDigits).format(amount / 100);
}
