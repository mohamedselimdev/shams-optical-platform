import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Storage: "local" (development) or "s3" (any S3-compatible service).
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: optional,
  S3_REGION: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_PUBLIC_BUCKET: optional,
  S3_PRIVATE_BUCKET: optional,
  S3_PUBLIC_BASE_URL: optional,

  REDIS_URL: optional,

  // Payments
  PAYMENT_SANDBOX_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  PAYMENT_SANDBOX_SECRET: z.string().default("sandbox-webhook-secret-dev-only"),
  PAYMOB_API_KEY: optional,
  PAYMOB_SECRET_KEY: optional,
  PAYMOB_PUBLIC_KEY: optional,
  PAYMOB_HMAC_SECRET: optional,
  PAYMOB_CARD_INTEGRATION_ID: optional,
  PAYMOB_WALLET_INTEGRATION_ID: optional,
  PAYMOB_BASE_URL: z.string().url().default("https://accept.paymob.com"),

  // Email / SMS
  EMAIL_FROM: z.string().default("SHAMS <no-reply@shams.example>"),
  SMTP_URL: optional,
  RESEND_API_KEY: optional,
  SMS_PROVIDER_API_KEY: optional,

  // Analytics
  GA4_MEASUREMENT_ID: optional,
  GA4_API_SECRET: optional,

  // Error tracking
  SENTRY_DSN: optional,

  // Hash salt for privacy-preserving IP hashing in audit/analytics.
  IP_HASH_SALT: z.string().default("dev-ip-salt"),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (parsed.data.NODE_ENV === "production") {
    if (parsed.data.BETTER_AUTH_SECRET.startsWith("dev-only")) {
      throw new Error("Refusing to start in production with the development auth secret");
    }
    if (parsed.data.PAYMENT_SANDBOX_ENABLED && parsed.data.PAYMENT_SANDBOX_SECRET.includes("dev-only")) {
      throw new Error("Refusing to start in production with the sandbox payment provider on its default secret; set PAYMENT_SANDBOX_ENABLED=false");
    }
  }
  return parsed.data;
}

export const env: Env = load();
