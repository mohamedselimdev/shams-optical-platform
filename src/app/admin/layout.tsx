import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "لوحة التحكم", template: "%s | لوحة تحكم شمس" },
  robots: { index: false, follow: false },
};

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return children;
}
