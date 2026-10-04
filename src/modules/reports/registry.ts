import "server-only";
import type { StaffActor } from "@/server/rbac/actor";
import type { Permission } from "@/server/rbac/permissions";
import { listOrders } from "../orders/service";
import { MOVEMENT_LABELS, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, CHANNEL_LABELS } from "@/i18n/labels";
import * as R from "./service";

export type ColumnType = "text" | "money" | "number" | "percent" | "date";
export type Column = { key: string; label: string; type: ColumnType };
export type ReportRange = R.ReportRange;
type Row = Record<string, string | number | Date | null>;

export type ReportDef = {
  key: string;
  title: string;
  description: string;
  /** Extra permission beyond reports.read (the underlying service also asserts its own). */
  permission: Permission;
  usesRange: boolean;
  columns: Column[];
  run: (actor: StaffActor, range: ReportRange) => Promise<Row[]>;
};

const money = (key: string, label: string): Column => ({ key, label, type: "money" });
const num = (key: string, label: string): Column => ({ key, label, type: "number" });
const text = (key: string, label: string): Column => ({ key, label, type: "text" });

export const REPORTS: ReportDef[] = [
  { key: "sales-by-day", title: "المبيعات اليومية", description: "صافي المبيعات وعدد الطلبات لكل يوم", permission: "reports.read", usesRange: true, columns: [text("day", "اليوم"), num("orders", "الطلبات"), money("net", "صافي المبيعات")], run: R.salesByDay },
  { key: "sales-by-branch", title: "المبيعات حسب الفرع", description: "حسب فرع التنفيذ", permission: "reports.read", usesRange: true, columns: [text("branch", "الفرع"), num("orders", "الطلبات"), money("net", "صافي المبيعات")], run: R.salesByBranch },
  { key: "sales-by-product", title: "المبيعات حسب المنتج", description: "الإيراد بدون الضريبة والهامش", permission: "reports.financial", usesRange: true, columns: [text("label", "المنتج"), num("units", "الوحدات"), money("revenue", "الإيراد"), money("cost", "التكلفة"), money("margin", "الهامش"), money("discount", "الخصومات")], run: (a, r) => R.salesByDimension(a, r, "product", 100) },
  { key: "sales-by-brand", title: "المبيعات حسب الماركة", description: "", permission: "reports.financial", usesRange: true, columns: [text("label", "الماركة"), num("units", "الوحدات"), money("revenue", "الإيراد"), money("margin", "الهامش")], run: (a, r) => R.salesByDimension(a, r, "brand", 50) },
  { key: "sales-by-category", title: "المبيعات حسب التصنيف", description: "", permission: "reports.financial", usesRange: true, columns: [text("label", "التصنيف"), num("units", "الوحدات"), money("revenue", "الإيراد"), money("margin", "الهامش")], run: (a, r) => R.salesByDimension(a, r, "category", 50) },
  { key: "payments", title: "أداء وسائل الدفع", description: "نسبة النجاح والمبالغ والمستردات", permission: "payments.read", usesRange: true, columns: [text("provider", "المزود"), text("method", "الطريقة"), num("attempts", "المحاولات"), num("succeeded", "الناجحة"), { key: "successRate", label: "نسبة النجاح", type: "percent" }, money("amount", "المحصّل"), money("refunded", "المسترد")], run: async (a, r) => (await R.paymentPerformance(a, r)).map((x) => ({ ...x, method: PAYMENT_METHOD_LABELS[x.method as keyof typeof PAYMENT_METHOD_LABELS] ?? x.method })) },
  { key: "discounts", title: "الخصومات والكوبونات", description: "", permission: "promotions.read", usesRange: true, columns: [text("name", "العرض"), text("code", "الكود"), num("uses", "الاستخدامات"), money("amount", "قيمة الخصم")], run: R.discountsReport },
  { key: "returns", title: "المرتجعات حسب السبب", description: "", permission: "returns.read", usesRange: true, columns: [text("reason", "السبب"), num("count", "العدد"), money("refunded", "المسترد")], run: R.returnsReport },
  { key: "top-customers", title: "أفضل العملاء", description: "", permission: "customers.read", usesRange: true, columns: [text("name", "العميل"), num("orders", "الطلبات"), money("net", "صافي المشتريات")], run: R.topCustomers },
  { key: "inventory-valuation", title: "تقييم المخزون", description: "بالتكلفة وسعر البيع لكل فرع", permission: "reports.financial", usesRange: false, columns: [text("branch", "الفرع"), num("units", "الوحدات"), money("cost", "بالتكلفة"), money("retail", "بسعر البيع")], run: (a, r) => R.inventoryValuation(a, r.branchId) },
  { key: "low-stock", title: "مخزون منخفض", description: "عند أو تحت حد إعادة الطلب", permission: "inventory.read", usesRange: false, columns: [text("sku", "SKU"), text("product", "المنتج"), text("branch", "الفرع"), num("onHand", "الرصيد"), num("reserved", "محجوز"), num("reorderPoint", "حد الطلب")], run: (a, r) => R.lowStock(a, r.branchId, 500) },
  { key: "dead-stock", title: "مخزون راكد (90 يوم)", description: "أصناف لم تُبع خلال 90 يوماً", permission: "inventory.read", usesRange: false, columns: [text("sku", "SKU"), text("product", "المنتج"), text("branch", "الفرع"), num("onHand", "الرصيد"), money("value", "القيمة بالتكلفة")], run: async (a, r) => (await R.deadStock(a, 90, r.branchId)).map((x) => ({ ...x, value: Number(x.value) })) },
  { key: "stock-movements", title: "ملخص حركات المخزون", description: "", permission: "inventory.read", usesRange: true, columns: [text("type", "النوع"), num("movements", "عدد الحركات"), num("units", "صافي الوحدات")], run: async (a, r) => (await R.stockMovementsReport(a, r)).map((x) => ({ ...x, type: MOVEMENT_LABELS[x.type as keyof typeof MOVEMENT_LABELS] ?? x.type })) },
  { key: "purchasing", title: "المشتريات حسب المورد", description: "", permission: "purchasing.read", usesRange: true, columns: [text("supplier", "المورد"), num("orders", "أوامر الشراء"), money("ordered", "المطلوب"), money("received", "المستلم")], run: R.purchasingBySupplier },
  { key: "marketing", title: "مصادر الزيارات والمبيعات", description: "حسب UTM والمُحيل", permission: "analytics.read", usesRange: true, columns: [text("source", "المصدر"), text("medium", "الوسيط"), text("campaign", "الحملة"), num("orders", "الطلبات"), money("net", "صافي المبيعات")], run: R.marketingAttribution },
];

/** Orders export (all pages, capped) — used by the orders list "Export" button. */
export const ORDERS_EXPORT: ReportDef = {
  key: "orders", title: "الطلبات", description: "", permission: "orders.read", usesRange: true,
  columns: [text("number", "رقم الطلب"), { key: "placedAt", label: "التاريخ", type: "date" }, text("status", "الحالة"), text("paymentStatus", "الدفع"), text("paymentMethod", "طريقة الدفع"), text("channel", "القناة"), text("branch", "الفرع"), text("contactName", "العميل"), text("contactPhone", "الهاتف"), money("total", "الإجمالي")],
  run: async () => [],
};

export async function runOrdersExport(actor: StaffActor, f: { q?: string; status?: string; branchId?: string; channel?: string; from?: Date; to?: Date }) {
  const rows: Row[] = [];
  for (let page = 1; page <= 334; page++) {
    const res = await listOrders(actor, { ...f, status: f.status as never, page });
    for (const o of res.items) {
      rows.push({ number: o.number, placedAt: o.placedAt, status: ORDER_STATUS_LABELS[o.status], paymentStatus: PAYMENT_STATUS_LABELS[o.paymentStatus], paymentMethod: PAYMENT_METHOD_LABELS[o.paymentMethod], channel: CHANNEL_LABELS[o.channel], branch: o.fulfillmentBranch.name, contactName: o.contactName, contactPhone: o.contactPhone, total: o.total });
    }
    if (page * res.pageSize >= res.total) break;
  }
  return rows;
}

export function findReport(key: string) {
  return REPORTS.find((r) => r.key === key) ?? null;
}
