import type { Tone } from "@/ui/primitives";
import type { OrderStatus, PaymentStatus, TransferStatus, PurchaseOrderStatus, ReturnStatus, PaymentAttemptStatus, PrescriptionStatus } from "@/generated/prisma/enums";

export const orderTone: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: "warning", PAID: "info", PROCESSING: "info", PRESCRIPTION_REVIEW: "sun", LENS_PREPARATION: "sun",
  READY: "info", SHIPPED: "info", READY_FOR_PICKUP: "sun", DELIVERED: "success", CANCELLED: "neutral", RETURNED: "danger", REFUNDED: "danger",
};
export const paymentTone: Record<PaymentStatus, Tone> = { UNPAID: "neutral", PENDING: "warning", PAID: "success", PARTIALLY_REFUNDED: "warning", REFUNDED: "danger", FAILED: "danger" };
export const attemptTone: Record<PaymentAttemptStatus, Tone> = { PENDING: "warning", REQUIRES_ACTION: "warning", SUCCEEDED: "success", FAILED: "danger", CANCELLED: "neutral", EXPIRED: "neutral" };
export const transferTone: Record<TransferStatus, Tone> = { DRAFT: "neutral", APPROVED: "info", IN_TRANSIT: "sun", RECEIVED: "success", CANCELLED: "neutral" };
export const poTone: Record<PurchaseOrderStatus, Tone> = { DRAFT: "neutral", SENT: "info", PARTIALLY_RECEIVED: "sun", RECEIVED: "success", CANCELLED: "neutral" };
export const returnTone: Record<ReturnStatus, Tone> = { REQUESTED: "warning", APPROVED: "info", REJECTED: "danger", RECEIVED: "sun", INSPECTED: "sun", COMPLETED: "success", CANCELLED: "neutral" };
export const rxTone: Record<PrescriptionStatus, Tone> = { PENDING_REVIEW: "warning", VERIFIED: "success", REJECTED: "danger" };
