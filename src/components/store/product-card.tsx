"use client";

import Link from "next/link";
import type { ProductCard as Card } from "@/modules/catalog/queries";
import { Money } from "@/ui/primitives";
import { useT } from "@/i18n/client";

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const t = useT();
  return (
    <article className="group relative flex flex-col">
      <Link href={`/p/${product.slug}`} className="relative block aspect-[4/3] overflow-hidden rounded-lg border border-line bg-surface-2">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- product media may be local SVG or remote storage; sizes are fixed by CSS.
          <img src={product.image.url} alt={product.image.alt ?? product.name} loading={priority ? "eager" : "lazy"} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex h-full items-center justify-center text-sm text-ink-faint">{t("لا توجد صورة")}</span>
        )}
        <span className="absolute start-2 top-2 flex flex-col gap-1">
          {product.compareAt ? <span className="rounded-full bg-clay px-2 py-0.5 text-xs font-medium text-white">{t("تخفيض")}</span> : null}
          {!product.inStock ? <span className="rounded-full bg-ink/80 px-2 py-0.5 text-xs text-surface">{t("نفد")}</span> : null}
        </span>
      </Link>
      <div className="mt-3 flex flex-1 flex-col gap-1">
        {product.brand ? <p className="text-xs font-medium tracking-wide text-ink-muted">{product.brand.name}</p> : null}
        <h3 className="text-sm font-medium leading-snug text-ink">
          <Link href={`/p/${product.slug}`} className="after:absolute after:inset-0">{product.name}</Link>
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <p className="flex items-baseline gap-2">
            <Money value={product.price} className="font-semibold" />
            {product.compareAt ? <Money value={product.compareAt} strike className="text-xs" /> : null}
          </p>
          {product.colors.length > 1 ? (
            <span className="flex -space-x-1 rtl:space-x-reverse" aria-label={t("{0} ألوان", [product.colors.length])}>
              {product.colors.slice(0, 4).map((c) => (
                <span key={c.hex} className="h-3.5 w-3.5 rounded-full border border-surface ring-1 ring-line" style={{ backgroundColor: c.hex }} title={c.name ?? undefined} />
              ))}
            </span>
          ) : null}
        </div>
        {product.prescriptionCompatible ? <p className="text-xs text-nile">{t("يمكن تركيب عدسات طبية")}</p> : null}
      </div>
    </article>
  );
}

export function ProductGrid({ products }: { products: Card[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}><ProductCard product={p} priority={i < 4} /></li>
      ))}
    </ul>
  );
}
