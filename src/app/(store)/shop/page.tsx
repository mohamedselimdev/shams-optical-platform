import type { Metadata } from "next";
import { parseCatalogFilter } from "@/modules/catalog/queries";
import { CatalogListing } from "@/components/store/catalog-listing";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const f = parseCatalogFilter(await searchParams);
  return { title: f.q ? `نتائج البحث عن "${f.q}"` : "كل المنتجات", alternates: { canonical: "/shop" }, robots: f.q ? { index: false } : undefined };
}

export default async function Shop({ searchParams }: { searchParams: SP }) {
  const filter = parseCatalogFilter(await searchParams);
  return (
    <div className="container-page py-10">
      <h1 className="mb-8 font-display text-3xl font-semibold">{filter.q ? <>نتائج البحث عن «{filter.q}»</> : "كل المنتجات"}</h1>
      <CatalogListing filter={filter} basePath="/shop" />
    </div>
  );
}
