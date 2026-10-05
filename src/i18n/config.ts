/** Supported interface languages. Arabic is the source language: every message key is its Arabic text. */
export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "shams_locale";

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "shams_theme";

export const isLocale = (v: unknown): v is Locale => v === "ar" || v === "en";
export const isTheme = (v: unknown): v is Theme => v === "light" || v === "dark" || v === "system";
export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");
/** BCP 47 tag used for number, currency and date formatting. */
export const intlTag = (l: Locale) => (l === "ar" ? "ar-EG" : "en-EG");
