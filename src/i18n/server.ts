import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, THEME_COOKIE, isLocale, isTheme, type Locale, type Theme } from "./config";
import { createTranslator, type Messages, type Translator } from "./translate";
import en from "./messages/en.json";

const catalogs: Record<Locale, Messages> = { ar: {}, en };

/** The visitor's interface language, from the preference cookie (Arabic by default). */
export const getLocale = cache(async (): Promise<Locale> => {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
});

export const getTheme = cache(async (): Promise<Theme> => {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : "system";
});

export const getT = cache(async (): Promise<Translator> => {
  const locale = await getLocale();
  return createTranslator(locale, catalogs[locale]);
});

/** Translator for a known locale outside a request (emails, exports, jobs). */
export function translatorFor(locale: Locale): Translator {
  return createTranslator(locale, catalogs[locale]);
}

export function messagesFor(locale: Locale): Messages {
  return catalogs[locale];
}
