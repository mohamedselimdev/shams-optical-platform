/** Arabic labels for enums. English can be added as a parallel map when i18n is enabled. */
import type {
  OrderStatus, PaymentStatus, PaymentMethod, FulfillmentType, TransferStatus, PurchaseOrderStatus, ReturnStatus,
  MovementType, ProductType, ProductStatus, PrescriptionStatus, Gender, PaymentAttemptStatus, RefundStatus, ReviewStatus,
  DiscountType, PromotionScope, LoyaltyTxType, SalesChannel, LensOptionGroup, ReturnResolution, RestockDecision,
} from "@/generated/prisma/enums";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "بانتظار الدفع",
  PAID: "مدفوع",
  PROCESSING: "قيد التجهيز",
  PRESCRIPTION_REVIEW: "مراجعة الوصفة",
  LENS_PREPARATION: "تجهيز العدسات",
  READY: "جاهز",
  SHIPPED: "تم الشحن",
  READY_FOR_PICKUP: "جاهز للاستلام",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
  RETURNED: "مرتجع",
  REFUNDED: "تم الاسترداد",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: "غير مدفوع",
  PENDING: "قيد المعالجة",
  PAID: "مدفوع",
  PARTIALLY_REFUNDED: "مسترد جزئياً",
  REFUNDED: "مسترد",
  FAILED: "فشل الدفع",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD: "بطاقة بنكية",
  WALLET: "محفظة إلكترونية",
  COD: "الدفع عند الاستلام",
  PAY_AT_BRANCH: "الدفع في الفرع",
  CASH: "نقداً (نقطة البيع)",
  CARD_PRESENT: "بطاقة (نقطة البيع)",
};

export const ATTEMPT_STATUS_LABELS: Record<PaymentAttemptStatus, string> = {
  PENDING: "معلق",
  REQUIRES_ACTION: "يتطلب إجراء",
  SUCCEEDED: "ناجح",
  FAILED: "فشل",
  CANCELLED: "ملغي",
  EXPIRED: "منتهي",
};

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = { PENDING: "قيد التنفيذ", SUCCEEDED: "تم", FAILED: "فشل" };

export const FULFILLMENT_LABELS: Record<FulfillmentType, string> = { DELIVERY: "توصيل للمنزل", PICKUP: "استلام من الفرع" };

export const CHANNEL_LABELS: Record<SalesChannel, string> = { WEB: "المتجر الإلكتروني", POS: "نقطة البيع", ADMIN: "لوحة التحكم" };

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  DRAFT: "مسودة",
  APPROVED: "معتمد",
  IN_TRANSIT: "في الطريق",
  RECEIVED: "تم الاستلام",
  CANCELLED: "ملغي",
};

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: "مسودة",
  SENT: "مرسل للمورد",
  PARTIALLY_RECEIVED: "مستلم جزئياً",
  RECEIVED: "مستلم بالكامل",
  CANCELLED: "ملغي",
};

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: "طلب جديد",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
  RECEIVED: "تم الاستلام",
  INSPECTED: "تم الفحص",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
};

export const RETURN_RESOLUTION_LABELS: Record<ReturnResolution, string> = { REFUND: "استرداد المبلغ", EXCHANGE: "استبدال" };
export const RESTOCK_LABELS: Record<RestockDecision, string> = { RESTOCK: "إعادة للمخزون", DAMAGED: "تالف", DISCARD: "إتلاف" };

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  OPENING_BALANCE: "رصيد افتتاحي",
  PURCHASE_RECEIPT: "استلام مشتريات",
  SALE: "بيع",
  RESERVATION: "حجز",
  RESERVATION_RELEASE: "إلغاء حجز",
  RETURN_RESTOCK: "مرتجع للمخزون",
  ADJUSTMENT: "تسوية",
  DAMAGE: "تالف",
  TRANSFER_OUT: "تحويل صادر",
  TRANSFER_IN: "تحويل وارد",
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  FRAME: "إطارات طبية",
  SUNGLASSES: "نظارات شمسية",
  ACCESSORY: "إكسسوارات",
  CONTACT_LENS: "عدسات لاصقة",
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = { DRAFT: "مسودة", ACTIVE: "منشور", ARCHIVED: "مؤرشف" };

export const PRESCRIPTION_STATUS_LABELS: Record<PrescriptionStatus, string> = {
  PENDING_REVIEW: "بانتظار المراجعة",
  VERIFIED: "معتمدة",
  REJECTED: "مرفوضة",
};

export const GENDER_LABELS: Record<Gender, string> = { MEN: "رجالي", WOMEN: "حريمي", UNISEX: "للجنسين", KIDS: "أطفال" };

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = { PENDING: "بانتظار المراجعة", APPROVED: "منشور", REJECTED: "مرفوض" };

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = { PERCENTAGE: "نسبة مئوية", FIXED_AMOUNT: "مبلغ ثابت", FREE_SHIPPING: "شحن مجاني" };

export const PROMOTION_SCOPE_LABELS: Record<PromotionScope, string> = {
  ORDER: "الطلب بالكامل",
  PRODUCTS: "منتجات محددة",
  CATEGORIES: "تصنيفات",
  BRANDS: "ماركات",
  COLLECTIONS: "مجموعات",
};

export const LOYALTY_TX_LABELS: Record<LoyaltyTxType, string> = {
  EARN: "اكتساب",
  REDEEM: "استبدال",
  REVERSAL: "عكس",
  ADJUSTMENT: "تعديل",
  EXPIRE: "انتهاء",
};

export const LENS_GROUP_LABELS: Record<LensOptionGroup, string> = {
  COATING: "طبقات الحماية",
  BLUE_LIGHT: "حماية الضوء الأزرق",
  PHOTOCHROMIC: "عدسات متغيرة اللون",
  TINT: "تلوين",
  POLARIZATION: "استقطاب",
};
