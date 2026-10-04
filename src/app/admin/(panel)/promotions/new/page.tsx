import { requireStaffPage } from "@/server/auth/session";
import { PageHeader } from "@/components/admin/page-header";
import { PromotionForm } from "@/components/admin/promotion-form";
import { promotionTargets, promotionValues } from "@/components/admin/promotion-data";
import { savePromotionAction } from "../actions";

export const metadata = { title: "عرض جديد" };

export default async function NewPromotion() {
  await requireStaffPage("promotions.write");
  return (
    <>
      <PageHeader back={{ href: "/admin/promotions", label: "العروض" }} title="عرض جديد" />
      <PromotionForm action={savePromotionAction} initial={promotionValues(null)} targets={await promotionTargets()} />
    </>
  );
}
