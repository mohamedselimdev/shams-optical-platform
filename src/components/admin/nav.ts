import type { Permission } from "@/server/rbac/permissions";

/**
 * Dashboard navigation. Filtering by permission is a convenience only; every page and action
 * re-checks permissions on the server.
 */
export type NavItem = { href: string; label: string; icon: string; permission: Permission };
export type NavGroup = { label: string; items: NavItem[] };

export const ADMIN_NAV: NavGroup[] = [
  {
    label: "العمليات",
    items: [
      { href: "/admin", label: "نظرة عامة", icon: "LayoutDashboard", permission: "dashboard.view" },
      { href: "/admin/orders", label: "الطلبات", icon: "ShoppingBag", permission: "orders.read" },
      { href: "/admin/pos", label: "نقطة البيع", icon: "Store", permission: "pos.use" },
      { href: "/admin/prescriptions", label: "الوصفات الطبية", icon: "Eye", permission: "prescriptions.read" },
      { href: "/admin/returns", label: "المرتجعات", icon: "Undo2", permission: "returns.read" },
      { href: "/admin/payments", label: "المدفوعات", icon: "CreditCard", permission: "payments.read" },
      { href: "/admin/shipping", label: "الشحن والاستلام", icon: "Truck", permission: "shipping.write" },
    ],
  },
  {
    label: "الكتالوج والمخزون",
    items: [
      { href: "/admin/products", label: "المنتجات", icon: "Glasses", permission: "catalog.read" },
      { href: "/admin/taxonomy", label: "التصنيفات والماركات", icon: "Tags", permission: "catalog.write" },
      { href: "/admin/lenses", label: "العدسات", icon: "Aperture", permission: "lenses.write" },
      { href: "/admin/inventory", label: "المخزون", icon: "Boxes", permission: "inventory.read" },
      { href: "/admin/transfers", label: "التحويلات", icon: "ArrowLeftRight", permission: "inventory.read" },
      { href: "/admin/branches", label: "الفروع", icon: "MapPin", permission: "branches.read" },
      { href: "/admin/suppliers", label: "الموردون", icon: "Factory", permission: "suppliers.read" },
      { href: "/admin/purchase-orders", label: "أوامر الشراء", icon: "ClipboardList", permission: "purchasing.read" },
    ],
  },
  {
    label: "العملاء والتسويق",
    items: [
      { href: "/admin/customers", label: "العملاء", icon: "Users", permission: "customers.read" },
      { href: "/admin/promotions", label: "العروض والكوبونات", icon: "BadgePercent", permission: "promotions.read" },
      { href: "/admin/loyalty", label: "الولاء", icon: "Sparkles", permission: "loyalty.read" },
      { href: "/admin/reviews", label: "التقييمات", icon: "Star", permission: "reviews.moderate" },
      { href: "/admin/cms", label: "المحتوى", icon: "LayoutTemplate", permission: "cms.write" },
    ],
  },
  {
    label: "التحليل",
    items: [
      { href: "/admin/analytics", label: "التحليلات", icon: "LineChart", permission: "analytics.read" },
      { href: "/admin/reports", label: "التقارير", icon: "FileBarChart", permission: "reports.read" },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { href: "/admin/staff", label: "الموظفون", icon: "UserCog", permission: "staff.read" },
      { href: "/admin/roles", label: "الأدوار والصلاحيات", icon: "ShieldCheck", permission: "roles.write" },
      { href: "/admin/notifications", label: "الإشعارات", icon: "Bell", permission: "notifications.read" },
      { href: "/admin/audit", label: "سجل التدقيق", icon: "ScrollText", permission: "audit.read" },
      { href: "/admin/settings", label: "الإعدادات", icon: "Settings", permission: "settings.write" },
      { href: "/admin/integrations", label: "التكاملات", icon: "Plug", permission: "integrations.read" },
      { href: "/admin/system", label: "صحة النظام", icon: "Activity", permission: "system.health" },
    ],
  },
];
