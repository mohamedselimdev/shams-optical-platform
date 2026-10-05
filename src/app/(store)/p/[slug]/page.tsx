import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { getCustomerActor } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { branchAvailability, getProductBySlug, relatedProducts } from "@/modules/catalog/queries";
import { lensCatalog } from "@/modules/lenses/pricing";
import { listPublicBranches } from "@/modules/branches/service";
import { listMyPrescriptions } from "@/modules/prescriptions/service";
import { GENDER_LABELS, LENS_GROUP_LABELS, PRODUCT_TYPE_LABELS, shapeLabel } from "@/i18n/labels";
import { ProductPurchase } from "@/components/store/product-purchase";
import { ProductGrid } from "@/components/store/product-card";
import { TrackOnMount } from "@/components/store/track-on-mount";
import { RecentlyViewed, RememberProduct, CompareButton } from "@/components/store/browsing-history";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { SelectField, TextArea, TextField } from "@/ui/fields";
import { DateText, DefinitionList } from "@/ui/primitives";
import { addToCartAction, reviewAction, toggleWishlistAction } from "./actions";
import { getT } from "@/i18n/server";
import { localizeContent } from "@/i18n/localize";
import type { Metadata } from "next";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) return {};
  const title = p.seoTitle ?? `${p.name}${p.brand ? ` — ${p.brand.name}` : ""}`;
  const description = p.seoDescription ?? p.description?.slice(0, 160) ?? undefined;
  return { title, description, alternates: { canonical: `/p/${p.slug}` }, openGraph: { title, description, images: p.images[0] ? [{ url: p.images[0].url }] : undefined } };
}

export default async function ProductPage({ params }: Props) {
  const t = await getT();
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const actor = await getCustomerActor();
  const [related, branches, availability, lens, rx, checkout, wished] = await Promise.all([
    relatedProducts(product.id, product.categoryId, product.brandId),
    listPublicBranches(),
    branchAvailability(product.id),
    product.prescriptionCompatible ? lensCatalog(db).then((c) => localizeContent(c, t.locale)) : Promise.resolve(null),
    actor ? listMyPrescriptions(actor) : Promise.resolve(null),
    getSetting("checkout"),
    actor ? db.wishlistItem.count({ where: { customerId: actor.customerId, productId: product.id } }) : Promise.resolve(0),
  ]);
  const v0 = product.variants[0];
  const prices = product.variants.map((v) => v.effectivePrice);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    sku: v0?.sku,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    image: product.images.map((i) => (i.url.startsWith("/") ? `${env.APP_URL}${i.url}` : i.url)),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "EGP",
      lowPrice: (Math.min(...prices) / 100).toFixed(2),
      highPrice: (Math.max(...prices) / 100).toFixed(2),
      availability: product.variants.some((v) => v.available > 0) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    aggregateRating: product.rating.count ? { "@type": "AggregateRating", ratingValue: product.rating.average.toFixed(1), reviewCount: product.rating.count } : undefined,
  };

  const specs: ({ label: string; value: React.ReactNode } | null)[] = [
    { label: t("النوع"), value: t(PRODUCT_TYPE_LABELS[product.type]) },
    product.gender ? { label: t("لمن"), value: t(GENDER_LABELS[product.gender]) } : null,
    product.frameShape ? { label: t("شكل الإطار"), value: t(shapeLabel(product.frameShape)) } : null,
    product.frameMaterial ? { label: t("الخامة"), value: product.frameMaterial } : null,
    v0?.lensWidthMm ? { label: t("المقاسات (عدسة □ جسر — ذراع)"), value: <span className="num" dir="ltr">{v0.lensWidthMm}□{v0.bridgeMm ?? "–"} — {v0.templeMm ?? "–"} mm</span> } : null,
    product.polarized ? { label: t("العدسات"), value: t("مستقطبة (Polarized)") } : null,
    { label: t("تركيب عدسات طبية"), value: product.prescriptionCompatible ? t("متاح") : t("غير متاح") },
  ];

  return (
    <div className="container-page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <TrackOnMount event={{ name: "product_view", productId: product.id }} />
      <RememberProduct id={product.id} />
      <nav aria-label={t("مسار التنقل")} className="mb-6 text-sm text-ink-muted">
        <Link href="/" className="hover:text-ink">{t("الرئيسية")}</Link>
        {product.category?.parent ? <> / <Link href={`/c/${product.category.parent.slug}`} className="hover:text-ink">{product.category.parent.name}</Link></> : null}
        {product.category ? <> / <Link href={`/c/${product.category.slug}`} className="hover:text-ink">{product.category.name}</Link></> : null}
        {" / "}<span className="text-ink">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-label={t("صور المنتج")} className="space-y-3">
          {product.images.length ? (
            product.images.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- product media (local SVG/uploads or object storage).
              <img key={img.id} src={img.url} alt={img.alt ?? product.name} loading={i === 0 ? "eager" : "lazy"} className="aspect-[4/3] w-full rounded-lg border border-line bg-surface-2 object-cover" />
            ))
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-faint">{t("لا توجد صورة")}</div>
          )}
        </section>

        <section className="space-y-6">
          <div>
            {product.brand ? <Link href={`/brands/${product.brand.slug}`} className="text-sm font-medium tracking-wide text-ink-muted hover:text-ink">{product.brand.name}</Link> : null}
            <h1 className="mt-1 font-display text-3xl font-semibold">{product.name}</h1>
            {product.rating.count ? (
              <p className="mt-2 flex items-center gap-1 text-sm text-ink-muted">
                <Star className="h-4 w-4 fill-sun-400 text-sun-400" aria-hidden />
                <span className="num">{product.rating.average.toFixed(1)}</span> · <a href="#reviews" className="hover:underline"><span className="num">{t.number(product.rating.count)}</span> {t("تقييم")}</a>
              </p>
            ) : null}
          </div>

          <ProductPurchase
            productId={product.id}
            variants={product.variants.map((v) => ({ id: v.id, sku: v.sku, colorName: v.colorName, colorHex: v.colorHex, sizeLabel: v.sizeLabel, price: v.price, effectivePrice: v.effectivePrice, available: v.available, lensWidthMm: v.lensWidthMm, bridgeMm: v.bridgeMm, templeMm: v.templeMm }))}
            lens={lens ? {
              types: lens.types.map((lensType) => ({ id: lensType.id, name: lensType.name, description: lensType.description, requiresPrescription: lensType.requiresPrescription, requiresAdd: lensType.requiresAdd })),
              indexes: lens.indexes.map((i) => ({ id: i.id, name: i.name, description: i.description })),
              prices: lens.prices,
              options: lens.options.map((o) => ({ id: o.id, name: o.name, description: o.description, group: o.group, price: o.price, exclusive: o.exclusive, lensTypeIds: o.lensTypeIds })),
              groupLabels: LENS_GROUP_LABELS,
            } : null}
            savedRx={rx ? rx.filter((r) => r.status !== "REJECTED").map((r) => ({ id: r.id, label: r.label, status: r.status })) : null}
            signedIn={Boolean(actor)}
            maxQty={checkout.maxQuantityPerLine}
            branches={branches.map((b) => ({ id: b.id, name: b.name }))}
            availability={availability}
            addAction={addToCartAction}
            loginHref={`/login?next=${encodeURIComponent(`/p/${product.slug}`)}`}
          />

          <div className="flex flex-wrap gap-2">
            <ActionForm action={toggleWishlistAction} showSuccess={false}>
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="path" value={`/p/${product.slug}`} />
              {actor ? (
                <SubmitButton variant="secondary" size="sm" pendingLabel="…">{wished ? t("♥ في المفضلة") : t("♡ أضف للمفضلة")}</SubmitButton>
              ) : (
                <Link href={`/login?next=${encodeURIComponent(`/p/${product.slug}`)}`} className="inline-flex h-8 items-center rounded-md border border-line-strong px-3 text-sm">{t("♡ أضف للمفضلة")}</Link>
              )}
            </ActionForm>
            <CompareButton id={product.id} />
          </div>

          {product.description ? <div className="whitespace-pre-line text-sm leading-7 text-ink-soft">{product.description}</div> : null}
          <DefinitionList items={specs.filter((x) => x !== null)} />
        </section>
      </div>

      <section id="reviews" className="mt-16 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" aria-labelledby="reviews-title">
        <div>
          <h2 id="reviews-title" className="mb-4 font-display text-2xl font-semibold">{t("التقييمات")}</h2>
          {product.reviews.length ? (
            <ul className="space-y-4">
              {product.reviews.map((r) => (
                <li key={r.id} className="rounded-lg border border-line bg-surface p-4">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="text-sun-500" aria-label={t("{0} من 5", [r.rating])}>{"★".repeat(r.rating)}<span className="text-line-strong">{"★".repeat(5 - r.rating)}</span></span>
                    <span className="font-medium">{r.customer.firstName}</span>
                    {r.verifiedPurchase ? <span className="text-xs text-success">{t("مشتري مؤكد")}</span> : null}
                    <span className="ms-auto text-xs text-ink-muted"><DateText value={r.createdAt} /></span>
                  </p>
                  {r.title ? <p className="mt-2 font-medium">{r.title}</p> : null}
                  {r.body ? <p className="mt-1 text-sm text-ink-soft">{r.body}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{t("لا توجد تقييمات بعد.")}</p>
          )}
        </div>
        <div className="rounded-lg border border-line bg-surface p-5">
          <h3 className="mb-3 font-semibold">{t("قيّم هذا المنتج")}</h3>
          {actor ? (
            <ActionForm action={reviewAction} resetOnSuccess className="space-y-3">
              <input type="hidden" name="productId" value={product.id} />
              <SelectField label={t("التقييم")} name="rating" required placeholder={t("اختر")} options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${"★".repeat(n)} (${n})` }))} />
              <TextField label={t("العنوان")} name="title" maxLength={120} />
              <TextArea label={t("رأيك")} name="body" rows={3} maxLength={2000} />
              <SubmitButton>{t("إرسال التقييم")}</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-muted"><Link href={`/login?next=${encodeURIComponent(`/p/${product.slug}`)}`} className="font-medium text-ink underline">{t("سجّل الدخول")}</Link> {t("لكتابة تقييم.")}</p>
          )}
        </div>
      </section>

      {related.length ? (
        <section className="mt-16" aria-labelledby="related-title">
          <h2 id="related-title" className="mb-6 font-display text-2xl font-semibold">{t("قد يعجبك أيضاً")}</h2>
          <ProductGrid products={related.slice(0, 4)} />
        </section>
      ) : null}
      <RecentlyViewed exclude={product.id} />
    </div>
  );
}
