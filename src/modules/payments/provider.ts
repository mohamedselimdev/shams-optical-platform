/**
 * Payment provider abstraction. Providers never receive or return raw card data: customers pay
 * on the provider's hosted page / SDK and SHAMS learns the result only through a verified webhook
 * (or a server-to-server status query during reconciliation).
 */
import type { PaymentMethod } from "@/generated/prisma/enums";

export type ProviderStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "EXPIRED";

export type CreatePaymentRequest = {
  paymentId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  customer: { name: string; email: string | null; phone: string };
  returnUrl: string;
  webhookUrl: string;
};

export type CreatePaymentResult = { externalId: string; redirectUrl: string | null; status: ProviderStatus; data?: Record<string, unknown> };

export type WebhookEvent = {
  eventId: string;
  type: "payment" | "refund";
  externalId: string;
  /** Our payment id when the provider echoes it back (merchant reference). */
  paymentId: string | null;
  status: ProviderStatus;
  amount: number;
  currency: string;
  failureReason?: string;
  raw: Record<string, unknown>;
};

export type WebhookRequest = { headers: Headers; rawBody: string; query: URLSearchParams };

export interface PaymentProvider {
  readonly key: string;
  readonly displayName: string;
  readonly methods: readonly PaymentMethod[];
  readonly sandbox: boolean;
  isConfigured(): boolean;
  createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult>;
  /** Verify authenticity and parse. Returns null when the signature is invalid. */
  parseWebhook(req: WebhookRequest): Promise<WebhookEvent | null>;
  fetchStatus(externalId: string): Promise<{ status: ProviderStatus; amount: number } | null>;
  refund(req: { externalId: string; amount: number; reason: string }): Promise<{ externalId: string; status: "SUCCEEDED" | "PENDING" | "FAILED"; failureReason?: string }>;
}
