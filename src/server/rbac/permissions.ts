/**
 * Permission catalog — the single source of truth for what staff can do.
 * Roles in the database reference these keys; unknown keys are ignored at runtime.
 * Every server action, route handler and service call checks these on the server.
 */
export const PERMISSIONS = {
  "dashboard.view": "عرض لوحة التحكم",
  "orders.read": "عرض الطلبات",
  "orders.update": "تحديث حالة الطلبات",
  "orders.cancel": "إلغاء الطلبات",
  "orders.create": "إنشاء طلبات (نقطة البيع)",
  "payments.read": "عرض المدفوعات",
  "payments.refund": "تنفيذ المرتجعات المالية",
  "payments.reconcile": "مطابقة المدفوعات",
  "catalog.read": "عرض المنتجات",
  "catalog.write": "إدارة المنتجات والتصنيفات",
  "catalog.price": "تعديل الأسعار والتكلفة",
  "lenses.write": "إدارة العدسات وأسعارها",
  "inventory.read": "عرض المخزون",
  "inventory.adjust": "تسوية المخزون",
  "transfers.create": "إنشاء تحويلات مخزون",
  "transfers.approve": "اعتماد تحويلات المخزون",
  "transfers.ship": "شحن التحويلات",
  "transfers.receive": "استلام التحويلات",
  "branches.read": "عرض الفروع",
  "branches.write": "إدارة الفروع",
  "suppliers.read": "عرض الموردين",
  "suppliers.write": "إدارة الموردين",
  "purchasing.read": "عرض أوامر الشراء",
  "purchasing.write": "إنشاء وإرسال أوامر الشراء",
  "purchasing.receive": "استلام بضاعة أوامر الشراء",
  "customers.read": "عرض العملاء",
  "customers.write": "تعديل بيانات العملاء",
  "customers.notes": "الملاحظات الداخلية للعملاء",
  "prescriptions.read": "عرض الوصفات الطبية",
  "prescriptions.review": "مراجعة واعتماد الوصفات",
  "returns.read": "عرض المرتجعات",
  "returns.manage": "إدارة المرتجعات",
  "promotions.read": "عرض العروض",
  "promotions.write": "إدارة العروض والكوبونات",
  "loyalty.read": "عرض نقاط الولاء",
  "loyalty.adjust": "تعديل نقاط الولاء",
  "reviews.moderate": "مراجعة التقييمات",
  "shipping.write": "إدارة الشحن والاستلام",
  "staff.read": "عرض الموظفين",
  "staff.write": "إدارة الموظفين",
  "roles.write": "إدارة الأدوار والصلاحيات",
  "cms.write": "إدارة المحتوى والتسويق",
  "analytics.read": "عرض التحليلات",
  "reports.read": "عرض التقارير",
  "reports.export": "تصدير التقارير",
  "reports.financial": "التقارير المالية والهوامش",
  "audit.read": "عرض سجل التدقيق",
  "settings.write": "إدارة الإعدادات",
  "integrations.read": "عرض التكاملات",
  "system.health": "صحة النظام",
  "pos.use": "استخدام نقطة البيع",
  "notifications.read": "الإشعارات",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

type RoleDef = { key: string; name: string; description: string; permissions: Permission[] | "*" };

const readOps: Permission[] = ["dashboard.view", "notifications.read"];

/** System roles seeded on install. Owners can create additional custom roles. */
export const SYSTEM_ROLES: RoleDef[] = [
  { key: "owner", name: "المالك", description: "صلاحيات كاملة على النظام", permissions: "*" },
  { key: "super_admin", name: "مدير النظام", description: "صلاحيات كاملة عدا ما يخص المالك", permissions: "*" },
  {
    key: "operations_manager",
    name: "مدير العمليات",
    description: "إدارة الطلبات والمخزون والفروع",
    permissions: [
      ...readOps,
      "orders.read", "orders.update", "orders.cancel", "orders.create",
      "payments.read", "payments.refund",
      "catalog.read", "catalog.write",
      "inventory.read", "inventory.adjust",
      "transfers.create", "transfers.approve", "transfers.ship", "transfers.receive",
      "branches.read", "suppliers.read", "purchasing.read", "purchasing.receive",
      "customers.read", "customers.write", "customers.notes",
      "prescriptions.read", "prescriptions.review",
      "returns.read", "returns.manage",
      "shipping.write", "reviews.moderate",
      "staff.read", "reports.read", "reports.export", "analytics.read", "pos.use",
    ],
  },
  {
    key: "branch_manager",
    name: "مدير فرع",
    description: "إدارة فرع واحد أو أكثر",
    permissions: [
      ...readOps,
      "orders.read", "orders.update", "orders.cancel", "orders.create",
      "payments.read",
      "catalog.read",
      "inventory.read", "inventory.adjust",
      "transfers.create", "transfers.ship", "transfers.receive",
      "branches.read",
      "purchasing.read", "purchasing.receive",
      "customers.read", "customers.write", "customers.notes",
      "prescriptions.read", "prescriptions.review",
      "returns.read", "returns.manage",
      "reports.read", "pos.use", "staff.read",
    ],
  },
  {
    key: "sales",
    name: "مبيعات",
    description: "خدمة العملاء في الفرع ونقطة البيع",
    permissions: [
      ...readOps, "orders.read", "orders.update", "orders.create", "catalog.read", "inventory.read",
      "customers.read", "customers.write", "prescriptions.read", "returns.read", "pos.use", "branches.read",
    ],
  },
  {
    key: "inventory",
    name: "مخزون",
    description: "إدارة المخزون والتحويلات والاستلام",
    permissions: [
      ...readOps, "catalog.read", "inventory.read", "inventory.adjust",
      "transfers.create", "transfers.ship", "transfers.receive",
      "branches.read", "purchasing.read", "purchasing.receive", "suppliers.read",
    ],
  },
  {
    key: "purchasing",
    name: "مشتريات",
    description: "الموردين وأوامر الشراء",
    permissions: [
      ...readOps, "catalog.read", "inventory.read", "suppliers.read", "suppliers.write",
      "purchasing.read", "purchasing.write", "purchasing.receive", "branches.read", "reports.read",
    ],
  },
  {
    key: "marketing",
    name: "تسويق",
    description: "المحتوى والعروض والتحليلات",
    permissions: [
      ...readOps, "catalog.read", "promotions.read", "promotions.write", "cms.write",
      "analytics.read", "reports.read", "reviews.moderate", "loyalty.read", "customers.read",
    ],
  },
  {
    key: "support",
    name: "دعم العملاء",
    description: "متابعة الطلبات والمرتجعات",
    permissions: [
      ...readOps, "orders.read", "orders.update", "customers.read", "customers.notes",
      "returns.read", "returns.manage", "loyalty.read", "catalog.read", "payments.read",
    ],
  },
  {
    key: "accountant",
    name: "محاسب",
    description: "المدفوعات والتقارير المالية",
    permissions: [
      ...readOps, "orders.read", "payments.read", "payments.refund", "payments.reconcile",
      "reports.read", "reports.export", "reports.financial", "purchasing.read", "suppliers.read",
      "inventory.read", "audit.read",
    ],
  },
  {
    key: "analytics_viewer",
    name: "مشاهد التحليلات",
    description: "عرض التحليلات والتقارير فقط",
    permissions: [...readOps, "analytics.read", "reports.read"],
  },
];

/** Permissions that only an Owner may grant or hold, preventing privilege escalation via role edits. */
export const OWNER_ONLY_ROLE_KEYS = new Set(["owner"]);
