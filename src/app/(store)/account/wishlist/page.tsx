import { requireCustomerPage } from "@/server/auth/session";
import { listMyWishlist } from "@/modules/customers/service";
import { productCardsByIds } from "@/modules/catalog/queries";
import { ProductCard } from "@/components/store/product-card";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { ButtonLink } from "@/ui/button";
import { EmptyState } from "@/ui/primitives";
import { removeWishlistAction } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("المفضلة") };
}

export default async function Wishlist() {
  const t = await getT();
  const actor = await requireCustomerPage("/account/wishlist");
  const products = await productCardsByIds(await listMyWishlist(actor));
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">{t("المفضلة")}</h1>
      {products.length ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
          {products.map((p) => (
            <li key={p.id} className="space-y-2">
              <ProductCard product={p} />
              <ActionForm action={removeWishlistAction} showSuccess={false}>
                <input type="hidden" name="productId" value={p.id} />
                <SubmitButton variant="ghost" size="sm" pendingLabel="…" className="relative z-10">{t("إزالة")}</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : <EmptyState title={t("قائمة المفضلة فارغة")} action={<ButtonLink href="/shop">{t("تصفح المنتجات")}</ButtonLink>} />}
    </div>
  );
}
