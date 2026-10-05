import Link from "next/link";
import { notFound } from "next/navigation";
import { parseCatalogFilter, taxonomyBySlug } from "@/modules/catalog/queries";
import { CatalogListing } from "@/components/store/catalog-listing";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const taxon2 = await taxonomyBySlug("brand", slug);
  if (!taxon2) return {};
  return { title: taxon2.name, description: taxon2.description ?? undefined, alternates: { canonical: `/brands/${taxon2.slug}` } };
}

export default async function TaxonomyPage({ params, searchParams }: Props) {
  const t = await getT();
  const { slug } = await params;
  const taxon = await taxonomyBySlug("brand", slug);
  if (!taxon) notFound();
  const filter = parseCatalogFilter({ ...(await searchParams), brand: slug });
  return (
    <div className="container-page py-10">
      <nav aria-label={t("مسار التنقل")} className="mb-3 text-sm text-ink-muted">
        <Link href="/" className="hover:text-ink">{t("الرئيسية")}</Link> / <Link href="/shop" className="hover:text-ink">{t("المتجر")}</Link> / <span className="text-ink">{taxon.name}</span>
      </nav>
      <h1 className="font-display text-3xl font-semibold">{taxon.name}</h1>
      {taxon.description ? <p className="mt-2 max-w-2xl text-ink-muted">{taxon.description}</p> : null}
      <div className="mt-8"><CatalogListing filter={filter} basePath={`/brands/${slug}`} fixed={{ brand: slug }} /></div>
    </div>
  );
}
