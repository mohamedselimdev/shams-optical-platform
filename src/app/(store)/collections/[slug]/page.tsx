import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseCatalogFilter, taxonomyBySlug } from "@/modules/catalog/queries";
import { CatalogListing } from "@/components/store/catalog-listing";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await taxonomyBySlug("collection", slug);
  if (!t) return {};
  return { title: t.name, description: t.description ?? undefined, alternates: { canonical: `/collections/${t.slug}` } };
}

export default async function TaxonomyPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const t = await taxonomyBySlug("collection", slug);
  if (!t) notFound();
  const filter = parseCatalogFilter({ ...(await searchParams), collection: slug });
  return (
    <div className="container-page py-10">
      <nav aria-label="مسار التنقل" className="mb-3 text-sm text-ink-muted">
        <Link href="/" className="hover:text-ink">الرئيسية</Link> / <Link href="/shop" className="hover:text-ink">المتجر</Link> / <span className="text-ink">{t.name}</span>
      </nav>
      <h1 className="font-display text-3xl font-semibold">{t.name}</h1>
      {t.description ? <p className="mt-2 max-w-2xl text-ink-muted">{t.description}</p> : null}
      <div className="mt-8"><CatalogListing filter={filter} basePath={`/collections/${slug}`} fixed={{ collection: slug }} /></div>
    </div>
  );
}
