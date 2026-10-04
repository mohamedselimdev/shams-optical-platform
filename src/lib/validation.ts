import { z } from "zod";
import { parseEgp, toAsciiDigits } from "./money";

/** Shared zod primitives for form input. Messages are Arabic because they are shown to users. */
export const zText = (max = 200) =>
  z.string().trim().min(1, "هذا الحقل مطلوب").max(max, `الحد الأقصى ${max} حرف`);

export const zOptionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `الحد الأقصى ${max} حرف`)
    .optional()
    .transform((v) => (v ? v : null));

export const zEgp = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    try {
      const p = parseEgp(v);
      if (p < 0) throw new RangeError();
      return p;
    } catch {
      ctx.addIssue({ code: "custom", message: "قيمة مالية غير صالحة" });
      return z.NEVER;
    }
  });

export const zOptionalEgp = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return null;
    try {
      const p = parseEgp(v);
      if (p < 0) throw new RangeError();
      return p;
    } catch {
      ctx.addIssue({ code: "custom", message: "قيمة مالية غير صالحة" });
      return z.NEVER;
    }
  });

export const zInt = (min = 0, max = 1_000_000) =>
  z.coerce.number({ message: "رقم غير صالح" }).int("يجب أن يكون رقماً صحيحاً").min(min, `الحد الأدنى ${min}`).max(max, `الحد الأقصى ${max}`);

export const zOptionalInt = (min = 0, max = 1_000_000) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Number(v)))
    .pipe(z.number().int().min(min).max(max).nullable());

export const zCheckbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("false"), z.literal(""), z.boolean()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true" || v === "1");

/** Egyptian mobile: 01[0125]XXXXXXXX, accepting +20 / 0020 prefixes and Arabic digits. */
export const zEgyptPhone = z
  .string()
  .trim()
  .transform((v) => toAsciiDigits(v).replace(/[\s-]/g, "").replace(/^(\+20|0020)/, "0"))
  .refine((v) => /^01[0125]\d{8}$/.test(v), "رقم موبايل مصري غير صالح");

export const zEmail = z.string().trim().toLowerCase().email("بريد إلكتروني غير صالح").max(200);

export const zSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "الرابط يجب أن يحتوي على أحرف إنجليزية صغيرة وأرقام وشرطات فقط")
  .max(120);

export const zId = z.string().min(1).max(64);

/** Internal relative path only — prevents open redirects. */
export const zSafePath = z
  .string()
  .trim()
  .refine((v) => isSafeInternalPath(v), "يجب أن يكون الرابط داخلياً ويبدأ بـ /");

export function isSafeInternalPath(v: string): boolean {
  return /^\/(?![\\/])[^\s]*$/.test(v) && !v.includes("://") && !v.toLowerCase().startsWith("/\\");
}

export function safeRedirectPath(input: string | null | undefined, fallback = "/"): string {
  if (!input) return fallback;
  return isSafeInternalPath(input) ? input : fallback;
}
