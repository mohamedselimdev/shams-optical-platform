import { Suspense } from "react";
import { storefrontContent } from "@/modules/cms/service";
import { getSession } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { cartCount } from "@/server/storefront";
import { StoreHeader } from "@/components/store/header";
import { StoreFooter } from "@/components/store/footer";
import { Analytics } from "@/components/store/analytics";
import { getT } from "@/i18n/server";
import { localizeContent } from "@/i18n/localize";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const [content, session, count, store, analytics, tax] = await Promise.all([
    storefrontContent(),
    getSession(),
    cartCount(),
    getSetting("store"),
    getSetting("analytics"),
    getSetting("tax"),
  ]);
  return (
    <>
      <a href="#main" className="skip-link">{t("انتقل إلى المحتوى")}</a>
      <StoreHeader nav={content.header} cartCount={count} signedIn={Boolean(session)} announcements={content.announcements} />
      <main id="main" className="min-h-[60vh]">{children}</main>
      <StoreFooter links={content.footer} pages={content.footerPages} store={localizeContent(store, t.locale)} pricesIncludeTax={tax.pricesIncludeTax} />
      <Suspense fallback={null}>
        <Analytics active={analytics.enabled} requireConsent={analytics.requireConsent} />
      </Suspense>
    </>
  );
}
