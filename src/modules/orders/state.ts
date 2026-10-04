/**
 * Order state machine. Pure and shared by services and UI (to render only valid next actions).
 */
import type { FulfillmentType, OrderStatus } from "@/generated/prisma/enums";

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "PRESCRIPTION_REVIEW", "CANCELLED"],
  PROCESSING: ["PRESCRIPTION_REVIEW", "LENS_PREPARATION", "READY", "CANCELLED"],
  PRESCRIPTION_REVIEW: ["LENS_PREPARATION", "PROCESSING", "CANCELLED"],
  LENS_PREPARATION: ["READY", "CANCELLED"],
  READY: ["SHIPPED", "READY_FOR_PICKUP", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  READY_FOR_PICKUP: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["RETURNED", "REFUNDED"],
  RETURNED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export function allowedTransitions(from: OrderStatus, fulfillment: FulfillmentType): OrderStatus[] {
  return TRANSITIONS[from].filter((to) => {
    if (to === "SHIPPED") return fulfillment === "DELIVERY";
    if (to === "READY_FOR_PICKUP") return fulfillment === "PICKUP";
    return true;
  });
}

export function canTransition(from: OrderStatus, to: OrderStatus, fulfillment: FulfillmentType) {
  return allowedTransitions(from, fulfillment).includes(to);
}

/** Statuses at which reserved stock has been converted into a sale (deducted). */
export const STOCK_DEDUCTED_AT: Record<FulfillmentType, OrderStatus> = { DELIVERY: "SHIPPED", PICKUP: "DELIVERED" };

/** Transitions staff trigger manually; RETURNED/REFUNDED come from the returns & refund flows. */
export const MANUAL_TARGETS: OrderStatus[] = [
  "PROCESSING",
  "PRESCRIPTION_REVIEW",
  "LENS_PREPARATION",
  "READY",
  "SHIPPED",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "CANCELLED",
];

/** Statuses the customer is notified about (public timeline). */
export const CUSTOMER_VISIBLE: OrderStatus[] = [
  "PAID",
  "PROCESSING",
  "PRESCRIPTION_REVIEW",
  "LENS_PREPARATION",
  "READY",
  "SHIPPED",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
  "REFUNDED",
];

export const OPEN_STATUSES: OrderStatus[] = ["PENDING_PAYMENT", "PAID", "PROCESSING", "PRESCRIPTION_REVIEW", "LENS_PREPARATION", "READY", "SHIPPED", "READY_FOR_PICKUP"];
