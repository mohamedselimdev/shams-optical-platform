import "server-only";
import { z } from "zod";
import { isDomainError } from "./errors";
import { logger } from "./logger";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code: string; fieldErrors?: Record<string, string> };

export const initialActionState: ActionResult<unknown> | null = null;

/** Convert FormData into a plain object; repeated keys become arrays. */
export function formToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const v = typeof value === "string" ? value : value;
    if (key.endsWith("[]")) {
      const k = key.slice(0, -2);
      (out[k] ??= []) as unknown[];
      (out[k] as unknown[]).push(v);
    } else if (key in out) {
      out[key] = Array.isArray(out[key]) ? [...(out[key] as unknown[]), v] : [out[key], v];
    } else {
      out[key] = v;
    }
  }
  return out;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Run a server action body with uniform error handling. Domain errors become safe messages;
 * anything else is logged with an incident id and reported generically (no stack traces leak).
 */
export async function runAction<T>(fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_")) {
      throw error; // redirect()/notFound() control flow
    }
    if (error instanceof z.ZodError) {
      return { ok: false, code: "VALIDATION", error: "يرجى مراجعة البيانات المدخلة", fieldErrors: fieldErrors(error) };
    }
    if (isDomainError(error)) {
      return { ok: false, code: error.code, error: error.message };
    }
    const incident = crypto.randomUUID().slice(0, 8);
    logger.error({ err: error, incident }, "unhandled action error");
    return { ok: false, code: "INTERNAL", error: `حدث خطأ غير متوقع (رمز: ${incident})` };
  }
}

/**
 * Convert FormData with dotted keys ("variants.0.sku") into nested objects/arrays. Sparse array
 * indexes (rows removed client-side) are compacted. Keys ending in "[]" collect repeated values.
 */
export function formToNested(form: FormData): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [rawKey, value] of form.entries()) {
    if (rawKey.startsWith("$ACTION") || value instanceof File) continue;
    const multi = rawKey.endsWith("[]");
    const parts = (multi ? rawKey.slice(0, -2) : rawKey).split(".");
    if (parts.some((p) => p === "__proto__" || p === "constructor" || p === "prototype")) continue;
    let node: Record<string, unknown> = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] ??= {};
      node = node[parts[i]] as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1];
    if (multi) ((node[leaf] ??= []) as unknown[]).push(value);
    else node[leaf] = value;
  }
  const compact = (v: unknown): unknown => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return Array.isArray(v) ? v.map(compact) : v;
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length && keys.every((k) => /^\d+$/.test(k))) return keys.sort((a, b) => Number(a) - Number(b)).map((k) => compact(obj[k]));
    return Object.fromEntries(keys.map((k) => [k, compact(obj[k])]));
  };
  return compact(root) as Record<string, unknown>;
}
