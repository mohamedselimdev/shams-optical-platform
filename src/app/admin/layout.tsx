import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
  title: { default: t("لوحة التحكم"), template: t("%s | لوحة تحكم شمس") },
  robots: { index: false, follow: false },
};
}

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return children;
}
