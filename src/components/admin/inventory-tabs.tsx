import Link from "next/link";
import { cn } from "@/ui/cn";

export function InventoryTabs({ active }: { active: "stock" | "movements" | "transfers" }) {
  const tabs = [
    { key: "stock", href: "/admin/inventory", label: "الأرصدة" },
    { key: "movements", href: "/admin/inventory/movements", label: "دفتر الحركات" },
    { key: "transfers", href: "/admin/transfers", label: "التحويلات" },
  ];
  return (
    <nav className="mb-4 flex gap-1 border-b border-line" aria-label="أقسام المخزون">
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} aria-current={active === tab.key ? "page" : undefined} className={cn("-mb-px border-b-2 px-4 py-2 text-sm", active === tab.key ? "border-sun-500 font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink")}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
