import { CURRENCY } from "@/lib/money";
import { dirOf, intlTag, type Locale } from "./config";

export type Messages = Record<string, string>;
export type Params = readonly (string | number)[] | Readonly<Record<string, string | number>>;

/**
 * Translate function. Keys are the Arabic source text (gettext style), so untranslated strings fall
 * back to Arabic instead of showing a key. Placeholders are `{0}`, `{1}` or `{name}`.
 */
export interface Translator {
  (source: string, params?: Params): string;
  locale: Locale;
  dir: "rtl" | "ltr";
  /** Translate a message produced elsewhere (domain errors, validation), including templated ones. */
  message(text: string): string;
  money(piasters: number): string;
  number(n: number): string;
  percent(ratio: number): string;
  date(d: Date | string, withTime?: boolean): string;
}

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = (params as Record<string, string | number>)[k];
    return v === undefined || v === null ? m : String(v);
  });
}

type Pattern = { re: RegExp; slots: string[]; target: string };
const patternCache = new WeakMap<Messages, Pattern[]>();

function patternsFor(messages: Messages): Pattern[] {
  let list = patternCache.get(messages);
  if (list) return list;
  list = [];
  for (const [source, target] of Object.entries(messages)) {
    if (!/\{\w+\}/.test(source)) continue;
    const slots: string[] = [];
    const body = source
      .split(/(\{\w+\})/)
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (m) {
          slots.push(m[1]);
          return "([\\s\\S]+?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    list.push({ re: new RegExp(`^${body}$`), slots, target });
  }
  patternCache.set(messages, list);
  return list;
}

const fmtCache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat>(key: string, make: () => T): T {
  let f = fmtCache.get(key) as T | undefined;
  if (!f) {
    f = make();
    fmtCache.set(key, f);
  }
  return f;
}

export function createTranslator(locale: Locale, messages: Messages): Translator {
  const tag = intlTag(locale);
  const lookup = (source: string) => (locale === "ar" ? source : (messages[source] ?? source));
  const t = ((source: string, params?: Params) => interpolate(lookup(source), params)) as Translator;
  t.locale = locale;
  t.dir = dirOf(locale);
  t.message = (text: string) => {
    if (locale === "ar" || !text) return text;
    if (messages[text] !== undefined) return messages[text];
    for (const p of patternsFor(messages)) {
      const m = p.re.exec(text);
      if (!m) continue;
      const values: Record<string, string> = {};
      p.slots.forEach((slot, i) => (values[slot] = t.message(m[i + 1])));
      return interpolate(p.target, values);
    }
    return text;
  };
  t.money = (piasters: number) => {
    const digits = piasters % 100 === 0 ? 0 : 2;
    const f = cached(`m:${tag}:${digits}`, () => new Intl.NumberFormat(tag, { style: "currency", currency: CURRENCY, minimumFractionDigits: digits, maximumFractionDigits: digits }));
    return f.format(piasters / 100);
  };
  t.number = (n: number) => cached(`n:${tag}`, () => new Intl.NumberFormat(tag)).format(n);
  t.percent = (r: number) => cached(`p:${tag}`, () => new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 1 })).format(r);
  t.date = (d: Date | string, withTime = false) =>
    cached(`d:${tag}:${withTime}`, () =>
      new Intl.DateTimeFormat(tag, withTime ? { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" } : { dateStyle: "medium", timeZone: "Africa/Cairo" }),
    ).format(typeof d === "string" ? new Date(d) : d);
  return t;
}

/** Marks a string for extraction without translating it (for module-level constants translated at use). */
export const msg = <T extends string>(source: T): T => source;
