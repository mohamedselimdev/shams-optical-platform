import Link from "next/link";
import { Logo } from "./logo";
import { getT } from "@/i18n/server";

export async function StoreFooter({ links, pages, store, pricesIncludeTax }: { pricesIncludeTax: boolean; links: { id: string; label: string; href: string }[]; pages: { slug: string; title: string }[]; store: { name: string; supportPhone: string; supportEmail: string; whatsapp?: string; instagram?: string; facebook?: string } }) {
  const t = await getT();
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-ink-muted">{t("نظارات طبية وشمسية وعدسات مصنّعة حسب وصفتك، مع توصيل لكل المحافظات واستلام من فروعنا.")}</p>
        </div>
        <nav aria-label={t("روابط المتجر")}>
          <h2 className="mb-3 text-sm font-semibold">{t("تسوّق")}</h2>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link href="/shop" className="hover:text-ink">{t("كل المنتجات")}</Link></li>
            {links.map((l) => <li key={l.id}><Link href={l.href} className="hover:text-ink">{l.label}</Link></li>)}
            <li><Link href="/stores" className="hover:text-ink">{t("فروعنا")}</Link></li>
            <li><Link href="/track" className="hover:text-ink">{t("تتبع طلبك")}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t("معلومات")}>
          <h2 className="mb-3 text-sm font-semibold">{t("معلومات")}</h2>
          <ul className="space-y-2 text-sm text-ink-soft">
            {pages.map((p) => <li key={p.slug}><Link href={`/pages/${p.slug}`} className="hover:text-ink">{p.title}</Link></li>)}
          </ul>
        </nav>
        <div>
          <h2 className="mb-3 text-sm font-semibold">{t("تواصل معنا")}</h2>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><a href={`tel:${store.supportPhone.replace(/\s/g, "")}`} className="num hover:text-ink" dir="ltr">{store.supportPhone}</a></li>
            <li><a href={`mailto:${store.supportEmail}`} className="hover:text-ink" dir="ltr">{store.supportEmail}</a></li>
            {store.whatsapp ? <li><a href={`https://wa.me/${store.whatsapp.replace(/\D/g, "")}`} className="hover:text-ink" rel="noopener" target="_blank">{t("واتساب")}</a></li> : null}
            {store.instagram ? <li><a href={store.instagram} className="hover:text-ink" rel="noopener" target="_blank">{t("إنستجرام")}</a></li> : null}
            {store.facebook ? <li><a href={store.facebook} className="hover:text-ink" rel="noopener" target="_blank">{t("فيسبوك")}</a></li> : null}
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-ink-muted">{t("© {0} {1}. الأسعار بالجنيه المصري{2}.", [new Date().getFullYear(), store.name, pricesIncludeTax ? t(" وتشمل ضريبة القيمة المضافة") : ""])}</div>
    </footer>
  );
}
