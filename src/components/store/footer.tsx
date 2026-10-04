import Link from "next/link";
import { Logo } from "./logo";

export function StoreFooter({ links, pages, store, pricesIncludeTax }: { pricesIncludeTax: boolean; links: { id: string; label: string; href: string }[]; pages: { slug: string; title: string }[]; store: { name: string; supportPhone: string; supportEmail: string; whatsapp?: string; instagram?: string; facebook?: string } }) {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-ink-muted">نظارات طبية وشمسية وعدسات مصنّعة حسب وصفتك، مع توصيل لكل المحافظات واستلام من فروعنا.</p>
        </div>
        <nav aria-label="روابط المتجر">
          <h2 className="mb-3 text-sm font-semibold">تسوّق</h2>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link href="/shop" className="hover:text-ink">كل المنتجات</Link></li>
            {links.map((l) => <li key={l.id}><Link href={l.href} className="hover:text-ink">{l.label}</Link></li>)}
            <li><Link href="/stores" className="hover:text-ink">فروعنا</Link></li>
            <li><Link href="/track" className="hover:text-ink">تتبع طلبك</Link></li>
          </ul>
        </nav>
        <nav aria-label="معلومات">
          <h2 className="mb-3 text-sm font-semibold">معلومات</h2>
          <ul className="space-y-2 text-sm text-ink-soft">
            {pages.map((p) => <li key={p.slug}><Link href={`/pages/${p.slug}`} className="hover:text-ink">{p.title}</Link></li>)}
          </ul>
        </nav>
        <div>
          <h2 className="mb-3 text-sm font-semibold">تواصل معنا</h2>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><a href={`tel:${store.supportPhone.replace(/\s/g, "")}`} className="num hover:text-ink" dir="ltr">{store.supportPhone}</a></li>
            <li><a href={`mailto:${store.supportEmail}`} className="hover:text-ink" dir="ltr">{store.supportEmail}</a></li>
            {store.whatsapp ? <li><a href={`https://wa.me/${store.whatsapp.replace(/\D/g, "")}`} className="hover:text-ink" rel="noopener" target="_blank">واتساب</a></li> : null}
            {store.instagram ? <li><a href={store.instagram} className="hover:text-ink" rel="noopener" target="_blank">إنستجرام</a></li> : null}
            {store.facebook ? <li><a href={store.facebook} className="hover:text-ink" rel="noopener" target="_blank">فيسبوك</a></li> : null}
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-ink-muted">© {new Date().getFullYear()} {store.name}. الأسعار بالجنيه المصري{pricesIncludeTax ? " وتشمل ضريبة القيمة المضافة" : ""}.</div>
    </footer>
  );
}
