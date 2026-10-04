import "server-only";
import { notFound } from "next/navigation";
import { isDomainError } from "@/server/errors";

/** Map domain NOT_FOUND (including out-of-branch records) to the Next 404 page. */
export async function loadOr404<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isDomainError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
}
