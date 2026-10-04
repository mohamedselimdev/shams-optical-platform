"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Circle, Menu, type LucideIcon, Activity, Aperture, ArrowLeftRight, BadgePercent, Bell, Boxes, ClipboardList, CreditCard, Eye, Factory, FileBarChart, Glasses, LayoutDashboard, LayoutTemplate, LineChart, MapPin, Plug, ScrollText, Settings, ShieldCheck, ShoppingBag, Sparkles, Star, Store, Tags, Truck, Undo2, UserCog, Users } from "lucide-react";

import { useState } from "react";
import { cn } from "@/ui/cn";
import type { NavGroup } from "./nav";

const ICONS: Record<string, LucideIcon> = { Activity, Aperture, ArrowLeftRight, BadgePercent, Bell, Boxes, ClipboardList, CreditCard, Eye, Factory, FileBarChart, Glasses, LayoutDashboard, LayoutTemplate, LineChart, MapPin, Plug, ScrollText, Settings, ShieldCheck, ShoppingBag, Sparkles, Star, Store, Tags, Truck, Undo2, UserCog, Users };

export function AdminSidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="admin-nav" className="fixed bottom-4 left-4 z-40 rounded-full bg-ink p-3 text-surface shadow-pop lg:hidden">
        <Menu className="h-5 w-5" aria-hidden />
        <span className="sr-only">القائمة</span>
      </button>
      <aside
        id="admin-nav"
        className={cn(
          "fixed inset-y-0 right-0 z-30 w-64 shrink-0 overflow-y-auto border-l border-ink-soft/40 bg-ink text-surface/80 transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 px-5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-sun-400 font-display text-sm font-bold text-ink">ش</span>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold text-surface">شمس</p>
            <p className="text-[11px] text-surface/50">لوحة العمليات</p>
          </div>
        </div>
        <nav aria-label="لوحة التحكم" className="space-y-5 px-3 pb-8">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wide text-surface/40">{g.label}</p>
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const Icon = ICONS[item.icon] ?? Circle;
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors", active ? "bg-surface/10 text-surface" : "hover:bg-surface/5 hover:text-surface")}
                      >
                        <Icon className={cn("h-4 w-4", active ? "text-sun-300" : "text-surface/50")} aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
