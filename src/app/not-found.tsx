import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <p className="font-display text-6xl font-bold text-sun-400">{t.number(404)}</p>
      <h1 className="mt-4 text-xl font-semibold">{t("الصفحة غير موجودة")}</h1>
      <Link href="/" className="mt-6 rounded-md bg-ink px-4 py-2 text-sm text-surface">{t("العودة للرئيسية")}</Link>
    </main>
  );
}
