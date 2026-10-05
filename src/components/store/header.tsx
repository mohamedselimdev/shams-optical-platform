import Link from "next/link";
import { Menu, Search, ShoppingBag, User } from "lucide-react";
import { Logo } from "./logo";
import { LanguageSwitch, ThemeSwitch } from "@/components/preferences";
import { getT } from "@/i18n/server";

type Nav = { id: string; label: string; href: string; children: { id: string; label: string; href: string }[] };

export async function StoreHeader({ nav, cartCount, signedIn, announcements }: { nav: Nav[]; cartCount: number; signedIn: boolean; announcements: { id: string; message: string; href: string | null }[] }) {
  const t = await getT();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      {announcements.length ? (
        <div className="bg-night text-center text-xs text-on-night">
          <div className="container-page flex justify-center gap-6 py-2">
            {announcements.slice(0, 2).map((a) =>
              a.href ? <Link key={a.id} href={a.href} className="underline-offset-2 hover:underline">{a.message}</Link> : <p key={a.id}>{a.message}</p>,
            )}
          </div>
        </div>
      ) : null}
      <div className="container-page flex h-16 items-center gap-4">
        <details className="relative lg:hidden">
          <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md hover:bg-surface-2" aria-label={t("القائمة")}>
            <Menu className="h-5 w-5" aria-hidden />
          </summary>
          <nav className="absolute start-0 top-12 w-72 rounded-lg border border-line bg-surface p-3 shadow-pop" aria-label={t("القائمة الرئيسية")}>
            <ul className="space-y-1">
              {nav.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-surface-2">{n.label}</Link>
                  {n.children.length ? (
                    <ul className="ms-3 border-s border-line ps-2">
                      {n.children.map((c) => <li key={c.id}><Link href={c.href} className="block rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2">{c.label}</Link></li>)}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </nav>
        </details>
        <Link href="/" aria-label={t("شمس للبصريات — الرئيسية")}><Logo /></Link>
        <nav className="hidden flex-1 lg:block" aria-label={t("القائمة الرئيسية")}>
          <ul className="flex items-center gap-1">
            {nav.map((n) => (
              <li key={n.id} className="group relative">
                <Link href={n.href} className="block rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink">{n.label}</Link>
                {n.children.length ? (
                  <ul className="invisible absolute start-0 top-full z-40 min-w-48 rounded-lg border border-line bg-surface p-2 opacity-0 shadow-pop transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    {n.children.map((c) => <li key={c.id}><Link href={c.href} className="block rounded-md px-3 py-2 text-sm hover:bg-surface-2">{c.label}</Link></li>)}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>
        <form action="/shop" method="get" role="search" className="ms-auto hidden max-w-xs flex-1 md:block lg:flex-none">
          <label className="relative block">
            <span className="sr-only">{t("ابحث عن منتج")}</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
            <input name="q" type="search" placeholder={t("ابحث عن نظارة، ماركة…")} className="h-10 w-full rounded-full border border-line-strong bg-surface ps-9 pe-4 text-sm focus:border-sun-500 focus:outline-none" />
          </label>
        </form>
        <div className="ms-auto flex items-center gap-1 md:ms-0">
          <LanguageSwitch className="hidden sm:inline-flex" />
          <ThemeSwitch />
          <Link href="/shop" className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface-2 md:hidden" aria-label={t("بحث")}><Search className="h-5 w-5" aria-hidden /></Link>
          <Link href={signedIn ? "/account" : "/login"} className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface-2" aria-label={signedIn ? t("حسابي") : t("تسجيل الدخول")}>
            <User className="h-5 w-5" aria-hidden />
          </Link>
          <Link href="/cart" className="relative flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface-2" aria-label={t("السلة ({0})", [cartCount])}>
            <ShoppingBag className="h-5 w-5" aria-hidden />
            {cartCount > 0 ? <span className="num absolute -top-0.5 -end-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-sun-400 px-1 text-[11px] font-bold text-night">{cartCount}</span> : null}
          </Link>
        </div>
      </div>
    </header>
  );
}
