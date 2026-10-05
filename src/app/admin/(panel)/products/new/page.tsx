import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/products/product-form";
import { productFormOptions, toFormValues } from "@/components/admin/products/form-data";
import { saveProductAction, uploadProductImage } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("منتج جديد") };
}

export default async function NewProduct() {
  const t = await getT();
  const actor = await requireStaffPage("catalog.write");
  const options = await productFormOptions();
  return (
    <>
      <PageHeader back={{ href: "/admin/products", label: t("المنتجات") }} title={t("منتج جديد")} />
      <ProductForm action={saveProductAction} upload={uploadProductImage} initial={toFormValues(null, true)} options={options} canPrice={can(actor, "catalog.price")} canSeeCost={can(actor, "catalog.price")} />
    </>
  );
}
