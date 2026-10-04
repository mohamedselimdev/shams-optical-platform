import "server-only";
import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { auth } from "./auth";
import { db } from "../db";
import { audit } from "../audit";
import { DomainError } from "../errors";
import { clientIp, enforceRateLimit, hashIp } from "../rate-limit";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

/**
 * Password sign-in with brute-force protection on top of better-auth:
 * per-IP and per-account rate limits plus temporary account lockout after repeated failures.
 * Error messages never reveal whether the email exists.
 */
export async function signInWithPassword(emailRaw: string, password: string, expect: "staff" | "customer") {
  const email = emailRaw.trim().toLowerCase();
  const ip = await clientIp();
  await enforceRateLimit(`login:ip:${ip}`, 20, 300);
  await enforceRateLimit(`login:acct:${email}`, 10, 300);

  const user = await db.user.findUnique({ where: { email }, include: { staff: { select: { isActive: true } } } });
  const generic = new DomainError("UNAUTHENTICATED", "البريد الإلكتروني أو كلمة المرور غير صحيحة");
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw new DomainError("RATE_LIMITED", "تم إيقاف الحساب مؤقتاً بسبب محاولات دخول متكررة، حاول بعد 15 دقيقة");
  }
  if (user && user.status !== "ACTIVE") throw generic;
  if (expect === "staff" && (!user?.staff || !user.staff.isActive)) {
    await audit(db, null, { action: "auth.login_failed", entityType: "user", entityId: user?.id ?? null, metadata: { surface: "admin", reason: "not_staff" }, ipHash: hashIp(ip) });
    throw generic;
  }

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) {
      if (user) {
        const failures = user.failedLogins + 1;
        const lock = failures >= MAX_FAILURES;
        await db.user.update({ where: { id: user.id }, data: { failedLogins: lock ? 0 : failures, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null } });
        await audit(db, null, { action: lock ? "auth.locked" : "auth.login_failed", entityType: "user", entityId: user.id, metadata: { surface: expect, failures }, ipHash: hashIp(ip) });
      }
      if (err.body?.code === "EMAIL_NOT_VERIFIED") throw new DomainError("UNAUTHENTICATED", "يرجى تأكيد بريدك الإلكتروني أولاً — أرسلنا لك رابط التأكيد");
      throw generic;
    }
    throw err;
  }
  if (user && (user.failedLogins > 0 || user.lockedUntil)) {
    await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  }
  return user;
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
}
