import { requireStaffPage } from "@/server/auth/session";
import { PageHeader } from "@/components/admin/page-header";
import { PromotionForm } from "@/components/admin/promotion-form";
import { promotionTargets, promotionValues } from "@/components/admin/promotion-data";
import { savePromotionAction } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("عرض جديد") };
}

export default async function NewPromotion() {
  const t = await getT();
  await requireStaffPage("promotions.write");
  return (
    <>
      <PageHeader back={{ href: "/admin/promotions", label: t("العروض") }} title={t("عرض جديد")} />
      <PromotionForm action={savePromotionAction} initial={promotionValues(null)} targets={await promotionTargets()} />
    </>
  );
}
