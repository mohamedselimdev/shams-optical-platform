import { ButtonLink } from "@/ui/button";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <p className="font-display text-6xl font-bold text-sun-400">{t.number(404)}</p>
      <h1 className="mt-4 text-xl font-semibold">{t("الصفحة غير موجودة")}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t("ربما تم نقلها أو حذفها.")}</p>
      <ButtonLink href="/shop" className="mt-6">{t("تصفح المنتجات")}</ButtonLink>
    </div>
  );
}
