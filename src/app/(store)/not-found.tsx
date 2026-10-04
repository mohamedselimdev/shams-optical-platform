import { ButtonLink } from "@/ui/button";

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <p className="font-display text-6xl font-bold text-sun-400">٤٠٤</p>
      <h1 className="mt-4 text-xl font-semibold">الصفحة غير موجودة</h1>
      <p className="mt-2 text-sm text-ink-muted">ربما تم نقلها أو حذفها.</p>
      <ButtonLink href="/shop" className="mt-6">تصفح المنتجات</ButtonLink>
    </div>
  );
}
