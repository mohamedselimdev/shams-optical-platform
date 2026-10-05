import type { Locale } from "./config";

/**
 * Bilingual database content: a field `x` may have an English twin `xEn` (name/nameEn,
 * description/descriptionEn, productName/productNameEn, CMS blocks/blocksEn). For English visitors this copies the
 * English value over the Arabic one wherever it is filled in; Arabic stays the fallback.
 * Works on nested query results (arrays, relations) and returns a new structure.
 */
export function localizeContent<T>(data: T, locale: Locale): T {
  if (locale === "ar") return data;
  return walk(data) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) out[k] = walk(v);
  for (const k of Object.keys(src)) {
    if (!k.endsWith("En")) continue;
    const base = k.slice(0, -2);
    const en = src[k];
    const filled = typeof en === "string" ? en.trim() !== "" : Array.isArray(en) && en.length > 0;
    if (base in src && filled) out[base] = walk(en);
  }
  return out;
}
