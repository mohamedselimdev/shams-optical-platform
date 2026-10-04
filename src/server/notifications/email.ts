import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";
import { logger } from "../logger";

export type EmailMessage = { to: string; subject: string; text: string };

export interface EmailTransport {
  readonly name: string;
  readonly configured: boolean;
  send(message: EmailMessage): Promise<{ id: string }>;
}

/** Development transport: writes messages to ./storage/dev-mail so links can be opened locally. */
class DevFileTransport implements EmailTransport {
  readonly name = "dev-file";
  readonly configured = true;
  async send(message: EmailMessage) {
    const dir = path.resolve(env.STORAGE_LOCAL_DIR, "dev-mail");
    await mkdir(dir, { recursive: true });
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeFile(
      path.join(dir, `${id}.txt`),
      `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`,
      "utf8",
    );
    logger.info({ id, transport: this.name }, "email written to dev mailbox");
    return { id };
  }
}

/** Resend HTTP API transport. Active only when RESEND_API_KEY is configured. */
class ResendTransport implements EmailTransport {
  readonly name = "resend";
  constructor(private readonly apiKey: string) {}
  get configured() {
    return true;
  }
  async send(message: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    const body = (await res.json()) as { id?: string };
    return { id: body.id ?? "unknown" };
  }
}

/** Production without a provider: refuse silently-lost mail by logging (without content) and failing. */
class UnconfiguredTransport implements EmailTransport {
  readonly name = "unconfigured";
  readonly configured = false;
  async send(): Promise<{ id: string }> {
    logger.error("email transport is not configured (set RESEND_API_KEY)");
    throw new Error("Email transport not configured");
  }
}

let transport: EmailTransport | null = null;
export function emailTransport(): EmailTransport {
  if (transport) return transport;
  if (env.RESEND_API_KEY) transport = new ResendTransport(env.RESEND_API_KEY);
  else if (env.NODE_ENV !== "production") transport = new DevFileTransport();
  else transport = new UnconfiguredTransport();
  return transport;
}

/** Auth emails contain secrets (tokens) and are therefore never persisted in the notification table. */
export async function sendAuthEmail(message: EmailMessage) {
  await emailTransport().send(message);
}
