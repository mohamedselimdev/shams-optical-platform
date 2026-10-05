import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { alexandria, plex } from "./fonts";
import { getLocale, getT, getTheme, messagesFor } from "@/i18n/server";
import { I18nProvider } from "@/i18n/client";
import "./globals.css";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const name = t("شمس للبصريات");
  return {
    metadataBase: new URL(appUrl),
    title: { default: `${name} | SHAMS Optics`, template: `%s | ${name}` },
    description: t("نظارات طبية وشمسية وعدسات مصنّعة حسب وصفتك — توصيل لجميع محافظات مصر واستلام من فروع شمس."),
    applicationName: "SHAMS",
    openGraph: { type: "website", locale: t.locale === "ar" ? "ar_EG" : "en_US", siteName: name },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#100e0b" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers opts every page into dynamic rendering, which the per-request CSP nonce
  // (set in src/proxy.ts and applied by Next.js to its own scripts) requires.
  await headers();
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      data-theme={theme === "system" ? undefined : theme}
      className={`${plex.variable} ${alexandria.variable}`}
    >
      <body className="min-h-dvh font-sans">
        <I18nProvider locale={locale} messages={messagesFor(locale)}>{children}</I18nProvider>
      </body>
    </html>
  );
}
