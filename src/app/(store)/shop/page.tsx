import { parseCatalogFilter } from "@/modules/catalog/queries";
import { CatalogListing } from "@/components/store/catalog-listing";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const t = await getT();
  const f = parseCatalogFilter(await searchParams);
  return { title: f.q ? t("نتائج البحث عن \"{0}\"", [f.q]) : t("كل المنتجات"), alternates: { canonical: "/shop" }, robots: f.q ? { index: false } : undefined };
}

export default async function Shop({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const filter = parseCatalogFilter(await searchParams);
  return (
    <div className="container-page py-10">
      <h1 className="mb-8 font-display text-3xl font-semibold">{filter.q ? <>{t("نتائج البحث عن «")}{filter.q}»</> : t("كل المنتجات")}</h1>
      <CatalogListing filter={filter} basePath="/shop" />
    </div>
  );
}
