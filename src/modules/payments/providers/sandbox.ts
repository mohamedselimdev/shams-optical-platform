import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import type { PaymentProvider, WebhookEvent, WebhookRequest } from "../provider";

/**
 * Sandbox provider for development and automated tests. It mimics a hosted payment page
 * (/pay/sandbox/[paymentId]) and delivers HMAC-signed webhooks exactly like a real gateway,
 * so the production code path (webhook → verification → idempotent processing) is exercised.
 * Disabled unless PAYMENT_SANDBOX_ENABLED=true; must not be enabled in production.
 */
export class SandboxProvider implements PaymentProvider {
  readonly key = "sandbox";
  readonly displayName = "بيئة اختبار الدفع";
  readonly methods = ["CARD", "WALLET"] as const;
  readonly sandbox = true;

  isConfigured() {
    return env.PAYMENT_SANDBOX_ENABLED;
  }

  async createPayment(req: Parameters<PaymentProvider["createPayment"]>[0]) {
    return {
      externalId: `sbx_${req.paymentId}`,
      redirectUrl: `/pay/sandbox/${req.paymentId}`,
      status: "PENDING" as const,
    };
  }

  static sign(body: string) {
    return createHmac("sha256", env.PAYMENT_SANDBOX_SECRET).update(body).digest("hex");
  }

  async parseWebhook(req: WebhookRequest): Promise<WebhookEvent | null> {
    const signature = req.headers.get("x-sandbox-signature") ?? "";
    const expected = SandboxProvider.sign(req.rawBody);
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const body = JSON.parse(req.rawBody) as {
      id: string;
      type: "payment" | "refund";
      externalId: string;
      paymentId: string;
      status: WebhookEvent["status"];
      amount: number;
      currency: string;
      failureReason?: string;
    };
    return {
      eventId: body.id,
      type: body.type,
      externalId: body.externalId,
      paymentId: body.paymentId,
      status: body.status,
      amount: body.amount,
      currency: body.currency,
      failureReason: body.failureReason,
      raw: body,
    };
  }

  async fetchStatus() {
    // The sandbox has no remote state; reconciliation relies on webhooks.
    return null;
  }

  async refund(req: { externalId: string; amount: number }) {
    return { externalId: `sbx_rf_${req.externalId}_${Date.now()}`, status: "SUCCEEDED" as const };
  }
}
