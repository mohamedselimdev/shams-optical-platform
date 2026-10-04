import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "../db";
import { env } from "../env";
import { sendAuthEmail } from "../notifications/email";

/**
 * Authentication is delegated to better-auth (scrypt password hashing, DB-backed sessions,
 * HttpOnly/SameSite cookies, origin/CSRF checks, token-based verification & reset flows).
 * Authorization (RBAC, branch scope) is SHAMS's own and lives in `src/server/rbac`.
 */
export const auth = betterAuth({
  appName: "SHAMS",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  trustedOrigins: [env.APP_URL],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "إعادة تعيين كلمة المرور — شمس",
        text: `مرحباً ${user.name}،\n\nلإعادة تعيين كلمة المرور اضغط على الرابط التالي (صالح لمدة 30 دقيقة):\n${url}\n\nإذا لم تطلب ذلك يمكنك تجاهل هذه الرسالة.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "تأكيد البريد الإلكتروني — شمس",
        text: `مرحباً ${user.name}،\n\nلتأكيد بريدك الإلكتروني اضغط على الرابط التالي:\n${url}`,
      });
    },
  },
  user: {
    additionalFields: {
      phone: { type: "string", required: false, input: true },
      kind: { type: "string", required: false, input: false, defaultValue: "CUSTOMER" },
      status: { type: "string", required: false, input: false, defaultValue: "ACTIVE" },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/forget-password": { window: 300, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    cookiePrefix: "shams",
    database: { generateId: () => crypto.randomUUID() },
  },
  telemetry: { enabled: false },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
