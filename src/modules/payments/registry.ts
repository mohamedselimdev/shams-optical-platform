import "server-only";
import type { PaymentMethod } from "@/generated/prisma/enums";
import type { PaymentProvider } from "./provider";
import { PaymobProvider } from "./providers/paymob";
import { SandboxProvider } from "./providers/sandbox";

const providers: PaymentProvider[] = [new PaymobProvider(), new SandboxProvider()];

export function getProvider(key: string): PaymentProvider | null {
  return providers.find((p) => p.key === key) ?? null;
}

/** Live providers take precedence; the sandbox is only used when no live provider is configured. */
export function providerForMethod(method: PaymentMethod): PaymentProvider | null {
  const candidates = providers.filter((p) => p.isConfigured() && (p.methods as readonly string[]).includes(method));
  return candidates.find((p) => !p.sandbox) ?? candidates[0] ?? null;
}

export function allProviders() {
  return providers.map((p) => ({ key: p.key, name: p.displayName, configured: p.isConfigured(), sandbox: p.sandbox, methods: p.methods }));
}

/** Offline methods handled by staff (no external provider). */
export const OFFLINE_PROVIDER: Record<string, string> = { COD: "cod", PAY_AT_BRANCH: "branch", CASH: "pos_cash", CARD_PRESENT: "pos_card" };
