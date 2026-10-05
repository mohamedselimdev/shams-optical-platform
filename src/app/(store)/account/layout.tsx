import Link from "next/link";
import { requireCustomerPage } from "@/server/auth/session";
import { customerSignOut } from "../(auth)/actions";
import { getT } from "@/i18n/server";

export const metadata = { robots: { index: false } };

const NAV = [
  ["/account", "نظرة عامة"],
  ["/account/orders", "طلباتي"],
  ["/account/prescriptions", "وصفاتي الطبية"],
  ["/account/returns", "المرتجعات"],
  ["/account/addresses", "العناوين"],
  ["/account/wishlist", "المفضلة"],
  ["/account/loyalty", "نقاط الولاء"],
  ["/account/profile", "الملف الشخصي"],
] as const;

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const actor = await requireCustomerPage();
  return (
    <div className="container-page grid gap-8 py-10 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside>
        <p className="mb-4 font-display text-lg font-semibold">{t("أهلاً، {0}", [actor.name.split(" ")[0]])}</p>
        <nav aria-label={t("حسابي")}>
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {NAV.map(([href, label]) => (
              <li key={href}><Link href={href} className="block whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-surface-2">{t(label)}</Link></li>
            ))}
          </ul>
        </nav>
        <form action={customerSignOut} className="mt-4">
          <button type="submit" className="px-3 text-sm text-ink-muted hover:text-danger">{t("تسجيل الخروج")}</button>
        </form>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
