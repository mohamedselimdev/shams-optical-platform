import Link from "next/link";
import { ArrowLeft, Glasses, MapPin, ShieldCheck, Truck } from "lucide-react";
import { db } from "@/server/db";
import { getSetting } from "@/server/settings";
import { activeBanners } from "@/modules/cms/service";
import { homeRail, storefrontTaxonomy } from "@/modules/catalog/queries";
import { listPublicBranches } from "@/modules/branches/service";
import { ProductGrid } from "@/components/store/product-card";
import { ButtonLink } from "@/ui/button";
import { getT } from "@/i18n/server";
import { localizeContent } from "@/i18n/localize";

export const dynamic = "force-dynamic";

type SectionConfig = { limit?: number; collectionSlug?: string };

export default async function Home() {
  const t = await getT();
  const [hero, promo, sections, taxonomy, branches, store] = await Promise.all([
    activeBanners("HOME_HERO"),
    activeBanners("HOME_PROMO"),
    db.homeSection.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }).then((rows) => localizeContent(rows, t.locale)),
    storefrontTaxonomy(),
    listPublicBranches(),
    getSetting("store"),
  ]);
  const rails = await Promise.all(sections.map((s) => homeRail(s.type, (s.config ?? {}) as SectionConfig)));
  const banner = hero[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: store.name,
    alternateName: store.nameEn,
    url: process.env.APP_URL,
    contactPoint: { "@type": "ContactPoint", telephone: store.supportPhone, contactType: "customer service", areaServed: "EG", availableLanguage: ["ar", "en"] },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="relative overflow-hidden bg-night text-on-night">
        <div className="absolute -end-24 -top-24 h-96 w-96 rounded-full bg-sun-400/90 blur-[2px]" aria-hidden />
        <div className="absolute end-40 top-56 h-24 w-24 rounded-full bg-sun-300/40" aria-hidden />
        <div className="container-page relative grid gap-8 py-16 md:py-24 lg:grid-cols-2">
          <div className="max-w-xl">
            <p className="mb-3 text-sm font-medium text-sun-300">{t("شمس للبصريات")}</p>
            <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">{banner?.title ?? t("شوف الدنيا بوضوح")}</h1>
            {banner?.subtitle ? <p className="mt-4 text-lg text-on-night/80">{banner.subtitle}</p> : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={banner?.ctaHref ?? "/shop"} variant="accent" size="lg">{banner?.ctaLabel ?? t("تسوّق الآن")}</ButtonLink>
              <ButtonLink href="/stores" variant="secondary" size="lg" className="border-on-night/30 bg-transparent text-on-night hover:bg-on-night/10">{t("فروعنا")}</ButtonLink>
            </div>
          </div>
          {banner?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- CMS-managed banner image (local or allow-listed https).
            <img src={banner.imageUrl} alt="" className="relative hidden aspect-[4/3] w-full rounded-xl object-cover lg:block" />
          ) : null}
        </div>
      </section>

      <section className="border-b border-line bg-surface" aria-label={t("مميزات الخدمة")}>
        <ul className="container-page grid grid-cols-2 gap-4 py-6 text-sm md:grid-cols-4">
          {[
            { icon: Glasses, title: t("عدسات حسب وصفتك"), text: t("يراجعها أخصائي قبل التصنيع") },
            { icon: Truck, title: t("توصيل لكل المحافظات"), text: t("أو الدفع عند الاستلام") },
            { icon: MapPin, title: t("{0} فروع", [branches.length]), text: t("استلم طلبك من أقرب فرع") },
            { icon: ShieldCheck, title: t("دفع آمن"), text: t("لا نخزن بيانات بطاقتك") },
          ].map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-sun-600" aria-hidden />
              <span><span className="block font-medium">{title}</span><span className="text-ink-muted">{text}</span></span>
            </li>
          ))}
        </ul>
      </section>

      <div className="container-page space-y-16 py-14">
        {sections.map((s, i) => {
          const cfg = (s.config ?? {}) as SectionConfig;
          if (s.type === "CATEGORIES") {
            return (
              <section key={s.id} aria-labelledby={`sec-${s.id}`}>
                <h2 id={`sec-${s.id}`} className="mb-6 font-display text-2xl font-semibold">{s.title}</h2>
                <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {taxonomy.categories.map((c, n) => (
                    <li key={c.slug}>
                      <Link href={`/c/${c.slug}`} className={`group flex h-32 flex-col justify-between rounded-lg p-5 transition hover:shadow-pop ${["bg-sun-100", "bg-surface-2", "bg-nile/10", "bg-clay/10"][n % 4]}`}>
                        <span className="font-display text-lg font-semibold">{c.name}</span>
                        <span className="flex items-center gap-1 text-sm text-ink-muted group-hover:text-ink">{t("تسوّق")}{" "}<ArrowLeft className="h-4 w-4 ltr:rotate-180" aria-hidden /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          }
          if (s.type === "BRANDS") {
            return (
              <section key={s.id} aria-labelledby={`sec-${s.id}`}>
                <h2 id={`sec-${s.id}`} className="mb-6 font-display text-2xl font-semibold">{s.title}</h2>
                <ul className="flex flex-wrap gap-3">
                  {taxonomy.brands.map((b) => (
                    <li key={b.slug}><Link href={`/brands/${b.slug}`} className="block rounded-full border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium hover:border-ink">{b.name}</Link></li>
                  ))}
                </ul>
              </section>
            );
          }
          const products = rails[i];
          if (!products.length) return null;
          const more = s.type === "COLLECTION" && cfg.collectionSlug ? `/collections/${cfg.collectionSlug}` : s.type === "BEST_SELLERS" ? "/shop?sort=popular" : "/shop";
          return (
            <section key={s.id} aria-labelledby={`sec-${s.id}`}>
              <div className="mb-6 flex items-end justify-between">
                <h2 id={`sec-${s.id}`} className="font-display text-2xl font-semibold">{s.title}</h2>
                <Link href={more} className="text-sm font-medium text-sun-700 hover:underline">{t("عرض الكل")}</Link>
              </div>
              <ProductGrid products={products} />
            </section>
          );
        })}

        {promo[0] ? (
          <section className="rounded-xl bg-nile px-8 py-12 text-on-night">
            <h2 className="font-display text-3xl font-bold">{promo[0].title}</h2>
            {promo[0].subtitle ? <p className="mt-2 max-w-xl text-on-night/80">{promo[0].subtitle}</p> : null}
            {promo[0].ctaHref ? <ButtonLink href={promo[0].ctaHref} variant="accent" className="mt-6">{promo[0].ctaLabel ?? t("اكتشف")}</ButtonLink> : null}
          </section>
        ) : null}
      </div>
    </>
  );
}
