import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { alexandria, plex } from "./fonts";
import "./globals.css";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "شمس للبصريات | SHAMS Optics", template: "%s | شمس للبصريات" },
  description: "نظارات طبية وشمسية وعدسات مصنّعة حسب وصفتك — توصيل لجميع محافظات مصر واستلام من فروع شمس.",
  applicationName: "SHAMS",
  openGraph: { type: "website", locale: "ar_EG", siteName: "شمس للبصريات" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#17140f",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers opts every page into dynamic rendering, which the per-request CSP nonce
  // (set in src/proxy.ts and applied by Next.js to its own scripts) requires.
  await headers();
  return (
    <html lang="ar" dir="rtl" className={`${plex.variable} ${alexandria.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
