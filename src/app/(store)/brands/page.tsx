import Link from "next/link";
import { storefrontTaxonomy } from "@/modules/catalog/queries";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("الماركات") };
}

export default async function Brands() {
  const t = await getT();
  const { brands } = await storefrontTaxonomy();
  return (
    <div className="container-page py-10">
      <h1 className="mb-8 font-display text-3xl font-semibold">{t("الماركات")}</h1>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {brands.map((b) => (
          <li key={b.slug}>
            <Link href={`/brands/${b.slug}`} className="flex h-28 items-center justify-center rounded-lg border border-line bg-surface p-4 text-center font-display text-lg font-semibold hover:border-ink">
              {b.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- brand logos are validated local or https URLs.
                <img src={b.logoUrl} alt={b.name} className="max-h-16 object-contain" />
              ) : b.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
