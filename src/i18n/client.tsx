"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { createTranslator, type Messages, type Translator } from "./translate";

const I18nContext = createContext<Translator>(createTranslator("ar", {}));

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const t = useMemo(() => createTranslator(locale, messages), [locale, messages]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

/** Translator for client components (the same API as `getT()` on the server). */
export function useT(): Translator {
  return useContext(I18nContext);
}
