/**
 * Domain errors carry a stable machine code and a safe, user-facing (Arabic) message.
 * Anything that is not a DomainError is treated as an internal error and never shown verbatim.
 */
export type ErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "INVALID_STATE"
  | "RATE_LIMITED"
  | "PAYMENT"
  | "INTERNAL";

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what = "العنصر") => new DomainError("NOT_FOUND", `${what} غير موجود`);
export const forbidden = (message = "ليس لديك صلاحية لتنفيذ هذا الإجراء") => new DomainError("FORBIDDEN", message);
export const unauthenticated = () => new DomainError("UNAUTHENTICATED", "يجب تسجيل الدخول أولاً");
export const invalid = (message: string, details?: Record<string, unknown>) =>
  new DomainError("VALIDATION", message, details);
export const conflict = (message: string) => new DomainError("CONFLICT", message);
export const invalidState = (message: string) => new DomainError("INVALID_STATE", message);

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}

export const httpStatus: Record<ErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  INVALID_STATE: 409,
  RATE_LIMITED: 429,
  PAYMENT: 402,
  INTERNAL: 500,
};
