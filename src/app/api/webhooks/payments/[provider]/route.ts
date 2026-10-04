import { type NextRequest, NextResponse } from "next/server";
import { handleWebhook } from "@/modules/payments/service";
import { logger } from "@/server/logger";

/**
 * Payment provider webhooks. The raw body is passed through untouched for signature verification.
 * Responses carry no detail beyond a status code; duplicates are acknowledged with 200 so providers
 * stop retrying, invalid signatures get 401, processing failures 500 (provider retries).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!/^[a-z0-9_-]{2,30}$/.test(provider)) return new NextResponse(null, { status: 404 });
  const rawBody = await req.text();
  if (rawBody.length > 256 * 1024) return new NextResponse(null, { status: 413 });
  try {
    const outcome = await handleWebhook(provider, { headers: req.headers, rawBody, query: req.nextUrl.searchParams });
    const status = outcome === "invalid_signature" ? 401 : outcome === "ignored" ? 404 : 200;
    return NextResponse.json({ ok: status === 200 }, { status });
  } catch (err) {
    logger.error({ err, provider }, "webhook processing failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
