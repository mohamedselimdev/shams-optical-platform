import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import type { PaymentProvider, ProviderStatus, WebhookEvent, WebhookRequest } from "../provider";

/**
 * Paymob (Accept) adapter — Egypt cards & mobile wallets via the Intention API and hosted
 * Unified Checkout. REQUIRES EXTERNAL CONFIG: PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY, PAYMOB_HMAC_SECRET,
 * PAYMOB_CARD_INTEGRATION_ID and/or PAYMOB_WALLET_INTEGRATION_ID. Not yet verified against live credentials.
 */

// Paymob transaction-callback HMAC: SHA-512 over these fields concatenated in this exact order.
const HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const;

function pick(obj: Record<string, unknown>, path: string): string {
  const v = path
    .split(".")
    .reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
  return v === undefined || v === null ? "" : String(v);
}

export function paymobHmac(obj: Record<string, unknown>, secret: string) {
  return createHmac("sha512", secret)
    .update(HMAC_FIELDS.map((f) => pick(obj, f)).join(""))
    .digest("hex");
}

export class PaymobProvider implements PaymentProvider {
  readonly key = "paymob";
  readonly displayName = "Paymob";
  readonly methods = ["CARD", "WALLET"] as const;
  readonly sandbox = false;

  isConfigured() {
    return Boolean(
      env.PAYMOB_SECRET_KEY &&
        env.PAYMOB_PUBLIC_KEY &&
        env.PAYMOB_HMAC_SECRET &&
        (env.PAYMOB_CARD_INTEGRATION_ID || env.PAYMOB_WALLET_INTEGRATION_ID),
    );
  }

  async createPayment(req: Parameters<PaymentProvider["createPayment"]>[0]) {
    const integration = req.method === "WALLET" ? env.PAYMOB_WALLET_INTEGRATION_ID : env.PAYMOB_CARD_INTEGRATION_ID;
    if (!integration) throw new Error(`Paymob integration for ${req.method} is not configured`);
    const [first, ...rest] = req.customer.name.split(" ");
    const res = await fetch(`${env.PAYMOB_BASE_URL}/v1/intention/`, {
      method: "POST",
      headers: { Authorization: `Token ${env.PAYMOB_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: req.amount,
        currency: req.currency,
        payment_methods: [Number(integration)],
        special_reference: req.paymentId,
        notification_url: req.webhookUrl,
        redirection_url: req.returnUrl,
        billing_data: {
          first_name: first || "Customer",
          last_name: rest.join(" ") || "-",
          email: req.customer.email ?? "no-reply@shams.example",
          phone_number: req.customer.phone,
          country: "EG",
        },
        extras: { order_number: req.orderNumber },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.error({ status: res.status }, "paymob intention failed");
      throw new Error(`Paymob intention failed (${res.status})`);
    }
    const body = (await res.json()) as { id: string; client_secret: string };
    return {
      externalId: String(body.id),
      redirectUrl: `${env.PAYMOB_BASE_URL}/unifiedcheckout/?publicKey=${encodeURIComponent(env.PAYMOB_PUBLIC_KEY!)}&clientSecret=${encodeURIComponent(body.client_secret)}`,
      status: "PENDING" as ProviderStatus,
    };
  }

  async parseWebhook(req: WebhookRequest): Promise<WebhookEvent | null> {
    if (!env.PAYMOB_HMAC_SECRET) return null;
    let payload: { type?: string; obj?: Record<string, unknown> };
    try {
      payload = JSON.parse(req.rawBody);
    } catch {
      return null;
    }
    const obj = payload.obj;
    if (!obj) return null;
    const received = req.query.get("hmac") ?? "";
    const expected = paymobHmac(obj, env.PAYMOB_HMAC_SECRET);
    const a = Buffer.from(received, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const success = pick(obj, "success") === "true";
    const pending = pick(obj, "pending") === "true";
    const refunded = pick(obj, "is_refunded") === "true";
    const status: ProviderStatus = success ? "SUCCEEDED" : pending ? "PENDING" : "FAILED";
    return {
      eventId: `txn_${pick(obj, "id")}_${status}${refunded ? "_rf" : ""}`,
      type: refunded ? "refund" : "payment",
      externalId: pick(obj, "payment_key_claims.extra.intention_id") || pick(obj, "order.id"),
      paymentId: pick(obj, "payment_key_claims.extra.special_reference") || pick(obj, "order.merchant_order_id") || null,
      status,
      amount: Number(pick(obj, "amount_cents")),
      currency: pick(obj, "currency") || "EGP",
      failureReason: success ? undefined : pick(obj, "data.message") || undefined,
      raw: { id: pick(obj, "id"), success, pending, amount_cents: pick(obj, "amount_cents") },
    };
  }

  async fetchStatus(): Promise<{ status: ProviderStatus; amount: number } | null> {
    // Transaction inquiry needs an auth-token flow that must be validated against live credentials;
    // until then reconciliation relies on webhooks and flags stale attempts for manual review.
    return null;
  }

  async refund(req: { externalId: string; amount: number; reason: string }) {
    const res = await fetch(`${env.PAYMOB_BASE_URL}/api/acceptance/void_refund/refund`, {
      method: "POST",
      headers: { Authorization: `Token ${env.PAYMOB_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transaction_id: req.externalId, amount_cents: req.amount }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { externalId: "", status: "FAILED" as const, failureReason: `Paymob refund failed (${res.status})` };
    const body = (await res.json()) as { id?: number; success?: boolean; pending?: boolean };
    return {
      externalId: String(body.id ?? ""),
      status: body.success ? ("SUCCEEDED" as const) : body.pending ? ("PENDING" as const) : ("FAILED" as const),
    };
  }
}
